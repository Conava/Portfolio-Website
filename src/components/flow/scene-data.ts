import type { HomeContent, Job, YearMonth } from "@/lib/types";

/** Content the 3D forms are built from (computed on the server from HomeContent). */
export interface FlowSceneData {
  /** BPMNscript sample: [length, indent] per line, at most 12. */
  code: [number, number][];
  /** Schools on a 0..1 time axis, oldest first; lane > 0 sits on top of an overlapping school; item is the school's place in the text. */
  schools: { x0: number; x1: number; lane: number; upcoming: boolean; current: boolean; item: number }[];
  /** The earlier jobs in the order the work beat lists them (lead first), with their length in months. */
  jobs: { id: string; months: number }[];
  /** Services the current job builds (first number in its first panel line). */
  services: number;
  /** [moved, total] apps of the current job's migration (first two numbers of its significant line). */
  migrate: [number, number];
  /** Applications the lead job's pipeline takes data in through. */
  intake: number;
  /** Featured Dux PRs as listed, and the part of the shell each one changed (null: none drawn). */
  prs: number;
  duxParts: (DuxPart | null)[];
  /** The featured devline run: its stages, the stages it stops at for approval, and the example's tasks, doc files and end options. */
  run: { ids: string[]; gates: number[]; tasks: number; docs: number; options: number } | null;
  /** The entries below the featured project: the Dux projects as one, then the others. */
  projects: number;
}

export type DuxPart = "bar" | "profiles" | "network" | "monitor" | "wallpaper";
/** A PR's title scope (`feat(sysmon): …`, `gops: …`) names the part of the shell it changed. */
const PART: [RegExp, DuxPart][] = [
  [/^\w+\((bar|island|popout)/, "bar"],
  [/^\w+\(settings\)/, "profiles"],
  [/^\w+\(network\)/, "network"],
  [/^(\w+\(sysmon\)|gops:)/, "monitor"],
  [/^(\w+\()?wallpaper/, "wallpaper"],
];

const months = (ym: YearMonth) => +ym.slice(0, 4) * 12 + +ym.slice(5, 7) - 1;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** The jobs as the work beats show them: the current one, the lead of the earlier ones (OTTO when present), then the rest. */
export function workOrder(jobs: Job[]) {
  const current = jobs.find((j) => j.end === null) ?? jobs[0];
  const past = jobs.filter((j) => j !== current);
  const lead = past.find((j) => j.id === "otto") ?? past[0];
  return { current, lead, others: past.filter((j) => j !== lead) };
}

export function sceneData(content: HomeContent, today: YearMonth): FlowSceneData {
  const code = content.bpmnscript.sample
    .split("\n")
    .slice(0, 12)
    .map((l): [number, number] => [l.trim().length, l.length - l.trimStart().length]);

  const { current, lead, others } = workOrder(content.work?.jobs ?? []);
  const jobs = [lead, ...others].filter(Boolean).map((j) => ({ id: j.id, months: months(j.end ?? today) - months(j.start) + 1 }));
  // Counts the forms draw come from the job's figures; the fallbacks only keep a form whole without them.
  const services = clamp(current?.figures?.services ?? 4, 1, 6);
  const { moved, apps: total } = current?.figures ?? {};
  const migrate: [number, number] = moved && total && moved <= total && total <= 12 ? [moved, total] : [5, 6];
  const projects = content.projects?.projects ?? [];
  const feature = projects.find((p) => p.emphasis) ?? projects[0];
  const viz = feature?.panel?.viz;
  const run =
    viz?.type === "devline-run"
      ? {
          ids: viz.stages.map((s) => s.id),
          gates: viz.stages.flatMap((s, i) => (s.gate ? [i] : [])),
          tasks: viz.card.tasks.length,
          docs: viz.card.docFiles.length,
          options: viz.card.options.length,
        }
      : null;
  const intake = clamp(lead?.figures?.apps ?? 4, 2, 6);
  const featured = content.dux?.featuredPrs ?? [];

  // A current school runs to today; an upcoming one has no end yet and is drawn 18 months long.
  const spans = (content.education?.schools ?? [])
    .map((s, item) => {
      const a = months(s.start);
      const b = s.end ? months(s.end) : s.status === "upcoming" ? a + 18 : Math.max(a + 1, months(today));
      return { a, b, upcoming: s.status === "upcoming", current: s.status === "in-progress", item, start: s.start };
    })
    .sort((x, y) => x.start.localeCompare(y.start));
  const rest = {
    code,
    jobs,
    services,
    migrate,
    intake,
    prs: featured.length,
    duxParts: featured.map((p) => PART.find(([re]) => re.test(p.title))?.[1] ?? null),
    run,
    projects: Math.max(0, projects.length - 1) + (content.dux?.projects.length ? 1 : 0),
  };
  if (!spans.length) return { ...rest, schools: [] };
  const t0 = Math.min(...spans.map((s) => s.a)), t1 = Math.max(...spans.map((s) => s.b));
  const u = (m: number) => (m - t0) / Math.max(1, t1 - t0);
  const placed: { a: number; b: number }[] = [];
  const schools = spans.map((s) => {
    const lane = placed.filter((p) => p.a < s.b && s.a < p.b).length;
    placed.push(s);
    return { x0: u(s.a), x1: u(s.b), lane, upcoming: s.upcoming, current: s.current, item: s.item };
  });
  return { ...rest, schools };
}
