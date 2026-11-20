import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import type { SectionProps } from "@/components/home-types";
import { formatMonth, formatRange } from "@/lib/format";
import { careerInputs, careerLayout, type Band, type CareerInput } from "../career";
import "./career.css";

// Vertical geometry in px (the horizontal is fractions of the time axis, see career.ts).
const AXIS = 30; // year labels
const PAD = 8; // lane padding above and below its rows
const ROW = 42;
const FOOT = 26; // the today label under the pool
const EV = 64; // start event and fork gateway, between the lane labels and the axis

/**
 * The hero's career diagram: one BPMN pool with a Work lane and an Education lane on a shared
 * month axis. A start event forks into both lanes; each entry is a task linking to its row
 * below. Running entries are lit: a set end is solid up to it, an open-ended one stops on the today
 * line (with a token) and its flow continues dashed. Upcoming entries are dashed. Overlapping entries take a row of their own,
 * forked and joined through parallel gateways. Server-rendered: complete without JS.
 */
export async function TraceCareer({ content, locale, today }: SectionProps) {
  const t = await getTranslations();
  const { jobs } = content.work;
  const { schools } = content.education;
  const meta = new Map<string, { href: string; aria: string }>();
  const period = (start: CareerInput["start"], end: CareerInput["end"]) =>
    start > today && !end ? t("dates.from", { date: formatMonth(start, locale) }) : formatRange(start, end, locale, t("date.present"));
  for (const j of jobs) meta.set(j.id, { href: `#${j.id}`, aria: `${j.company}, ${j.role}, ${period(j.start, j.end)}` });
  for (const s of schools) meta.set(s.id, { href: `#${s.id}`, aria: `${s.name}, ${s.degree}, ${s.field}, ${period(s.start, s.end)}` });
  const input = careerInputs(content);
  const layout = careerLayout(input, today);
  const { rows } = layout;

  const bandH = (b: Band) => 2 * PAD + rows[b] * ROW;
  const top: Record<Band, number> = { work: AXIS, edu: AXIS + bandH("work") };
  const cy = (b: Band, row: number) => top[b] + PAD + row * ROW + ROW / 2;
  const H = top.edu + bandH("edu");
  const mid = top.edu;
  const at = (x: number, w?: number, y?: number): CSSProperties =>
    ({ "--x": x.toFixed(4), ...(w !== undefined && { "--w": w.toFixed(4) }), ...(y !== undefined && { top: `${y}px` }) }) as CSSProperties;
  const bands: { id: Band; label: string }[] = [
    { id: "work", label: t("sections.work") },
    { id: "edu", label: t("sections.education") },
  ];

  return (
    <figure className="t-career">
      <figcaption className="meta t-career-cap">
        {t("trace.career")}
        <span className="cg-key" data-kind="now">
          {t("trace.careerNow")}
        </span>
        <span className="cg-key" data-kind="next">
          {t("trace.careerNext")}
        </span>
      </figcaption>
      <div className="t-career-scroll">
        <div className="cg" style={{ height: H + FOOT, "--ev": `${EV}px` } as CSSProperties}>
          {bands.map((b) => (
            <div key={b.id} className="cg-lane" data-band={b.id} style={{ top: top[b.id], height: bandH(b.id) }}>
              <span className="cg-lab">{b.label}</span>
            </div>
          ))}
          <div className="cg-draw" aria-hidden="true">
            {layout.ticks.map((k) => (
              <span key={k.label} className="cg-tick cg-at" style={at(k.at)}>
                {k.label}
              </span>
            ))}
            {/* Start event, then a parallel gateway forking into both lanes. */}
            <svg className="cg-start" width={EV} height={H} viewBox={`0 0 ${EV} ${H}`}>
              <path className="cg-line" d={`M22 ${mid}H32M40 ${mid - 8}V${cy("work", 0)}H${EV}M40 ${mid + 8}V${cy("edu", 0)}H${EV}`} />
              <circle className="cg-se" cx="13" cy={mid} r="8" />
              <path className="cg-gwd" d={`M40 ${mid - 8}L48 ${mid}L40 ${mid + 8}L32 ${mid}Z`} />
              <path className="cg-line" d={`M36 ${mid}H44M40 ${mid - 4}V${mid + 4}`} />
            </svg>
            {bands.map((b) => {
              const row0 = layout.tasks.filter((x) => x.band === b.id && x.row === 0);
              const last = row0[row0.length - 1];
              return (
                <span key={b.id}>
                  {last && <i className="cg-flow cg-at" style={at(0, last.x0, cy(b.id, 0))} />}
                  {last?.kind === "now" && last.end === null && <i className="cg-flow cg-on cg-at" style={at(last.x1, 1 - last.x1, cy(b.id, 0))} />}
                </span>
              );
            })}
            {layout.tasks
              .filter((x) => x.row > 0)
              .map((x) => (
                <i
                  key={x.id}
                  className="cg-br cg-at"
                  data-join={x.kind === "done" ? "" : undefined}
                  style={{ ...at(x.x0, x.x1 - x.x0, cy(x.band, x.row - 1)), height: ROW }}
                >
                  <b className="cg-gw" />
                  {x.kind === "done" && <b className="cg-gw" data-join="" />}
                </i>
              ))}
            <i className="cg-today cg-at" style={{ ...at(layout.today), top: AXIS - 4, height: H - AXIS + 12 }} />
            <span className="cg-now cg-at" style={{ ...at(layout.today), top: H + 8 }}>
              {formatMonth(today, locale)}
            </span>
          </div>
          {layout.tasks.map((x) => (
            <a
              key={x.id}
              href={meta.get(x.id)!.href}
              aria-label={meta.get(x.id)!.aria}
              className="cg-task cg-at"
              data-kind={x.kind}
              data-open={x.kind === "now" && x.end === null ? "" : undefined}
              data-out={x.out ? "" : undefined}
              data-branch={x.row > 0 ? "" : undefined}
              style={at(x.x0, x.x1 - x.x0, cy(x.band, x.row))}
            >
              <span className="cg-l">{x.label}</span>
            </a>
          ))}
          {layout.tasks
            .filter((x) => x.kind === "now")
            .map((x) => (
              <i key={x.id} className="cg-tok cg-at" aria-hidden="true" style={at(layout.today, undefined, cy(x.band, x.row))} />
            ))}
        </div>
      </div>
    </figure>
  );
}
