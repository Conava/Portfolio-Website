import { Fragment, type CSSProperties, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { RevealOnce } from "@/components/shared/reveal-once";
import type { Locale, PipelineAgent, PipelineExtras, PipelineStage } from "@/lib/types";
import "./viz.css";
import "./pipeline.css";

type Step =
  | { kind: "start"; key: string }
  | { kind: "end"; key: string }
  | { kind: "gate"; key: string; of: string; id?: string }
  | { kind: "stage"; key: string; s: PipelineStage };

type Run = {
  lanes: Record<"you" | "skills" | "agents", string>;
  start: string;
  end: string;
  gate: string;
  gateOf: Record<string, string>;
  skip: string;
  agent: Record<string, string>;
  ladder: string;
  replan: string;
  replanShort: string;
  iterate: string;
  iterateShort: string;
  fix: string;
  hooks: string;
  hook: Record<string, string>;
  alone: string;
  aloneNote: Record<string, string>;
  srSteps: string;
  srOptional: string;
  srLoops: string;
  kinds: Record<"skill" | "agent" | "kb", string>;
  cap: string;
  cost: string;
  srKinds: string;
};

/** Stroke icons on a 24 grid; drawn in currentColor. */
const ICON: Record<string, ReactNode> = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  designer: <path d="M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3" />,
  planner: <path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1" />,
  implementer: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />,
  reviewer: (
    <>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  debugger: <path d="M8 10h8v5a4 4 0 0 1-8 0zM10 10V8a2 2 0 0 1 4 0v2M4 13h4M16 13h4M5 8.5l3 2M19 8.5l-3 2M5 19l3-2M19 19l-3-2" />,
  "docs-keeper": <path d="M5 19.5V5a2 2 0 0 1 2-2h12v14H7a2 2 0 0 0-2 2.5 2 2 0 0 0 2 1.5h12M9 7h6" />,
  you: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  dependency: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" />,
  kb: <path d="M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5V19c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5zM12 6v13.5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  skill: <path d="M5 4h14v16H5zM9 9h6M9 13h6" />,
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />,
  "validate-bash.sh": <path d="M4 6l6 6-6 6M12 18h8" />,
  "validate-write.sh": (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M16 7l3 3" />
    </>
  ),
  "pre-compact.sh": <path d="M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7" />,
};
const Icon = ({ name, className = "vr-ico" }: { name: string; className?: string }) =>
  ICON[name] ? (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICON[name]}
    </svg>
  ) : null;

/**
 * A chip that opens a one-line note as a native popover anchored to it: no layout shift, light
 * dismiss and Esc for free, works without JS. Browsers without anchor positioning centre it.
 */
const Tip = ({ id, note, children }: { id: string; note: ReactNode; children: ReactNode }) => (
  <>
    <button type="button" className="vr-tip" popoverTarget={id} aria-describedby={id} style={{ anchorName: `--${id}` } as CSSProperties}>
      {children}
      <Icon name="info" className="vr-ico vr-i" />
    </button>
    <span id={id} popover="auto" className="vr-pop" style={{ positionAnchor: `--${id}` } as CSSProperties}>
      {note}
    </span>
  </>
);

/** Start event, the stages, a gate after every approval stage, end event. */
function toSteps(stages: PipelineStage[], gateOf: Record<string, string>): Step[] {
  const steps: Step[] = [{ kind: "start", key: "start" }];
  for (const s of stages) {
    const key = s.id ?? s.label;
    if (s.gate) steps.push({ kind: "gate", key, of: s.label, id: s.id });
    else {
      steps.push({ kind: "stage", key, s });
      if (s.approval) steps.push({ kind: "gate", key: `${key}-gate`, of: gateOf[key] ?? s.label });
    }
  }
  steps.push({ kind: "end", key: "end" });
  return steps;
}

/** Wide layout: one grid track per step; the per-task stage gets the room for its fan. */
const track = (st: Step) =>
  st.kind === "start" ? "minmax(2.75rem, 0.2fr)"
  : st.kind === "end" ? "minmax(4rem, 0.3fr)"
  : st.kind === "gate" ? "var(--vr-gw)"
  : st.s.perTask ? "minmax(min-content, 1.5fr)" : "minmax(min-content, 1fr)";

const ARROW = " → ";
const LADDER = ["implementer", "debugger", "planner"];

/**
 * Relative model tiers, out of 3: capability (bars) and cost (coins). Only the order is a fact
 * (Opus is the more capable and the more expensive model); the pip counts are not prices.
 */
const TIER: Record<string, { cap: number; cost: number }> = { Opus: { cap: 3, cost: 3 }, Sonnet: { cap: 2, cost: 1 } };
const PIPS = [1, 2, 3];

/** Capability bars and cost coins for a model; drawn only, the sr text names the model. */
const Tier = ({ model }: { model: string }) => {
  const t = TIER[model];
  return t ? (
    <span className="vr-tier" data-model={model.toLowerCase()}>
      <span className="vr-bars">
        {PIPS.map((n) => (
          <i key={n} data-on={n <= t.cap ? "" : undefined} />
        ))}
      </span>
      <span className="vr-coins">
        {PIPS.map((n) => (
          <i key={n} data-on={n <= t.cost ? "" : undefined} />
        ))}
      </span>
    </span>
  ) : null;
};

/** An agent: round chip with its glyph, name and model tier; the kb-skills it loads hang below. */
const Agent = ({ a }: { a: PipelineAgent }) => (
  <>
    <span className="vr-chip">
      <Icon name={a.id} />
      <code>{a.id}</code>
      <Tier model={a.model} />
    </span>
    {a.kb?.length ? (
      <ul className="vr-kb">
        {a.kb.map((k) => (
          <li key={k}>
            <Icon name="kb" />
            {k.replace(/^kb-/, "")}
          </li>
        ))}
      </ul>
    ) : null}
  </>
);


/**
 * A devline run as a swimlane diagram with as little text as possible. Three kinds of building
 * block, each with its own shape: skills (square cards on the main path, and the skills that also
 * run alone), agents (round chips with a capability/cost mark for their model) and kb-skills
 * (book tags under the agents that load them). Lanes: the developer (start, manual approval gates,
 * merge), skills (the path, the optional design branch, the per-task tracks) and agents. Each loop
 * is one continuous line from its source back to the plan. Hooks frame the run. The drawing is
 * aria-hidden; a list gives screen readers every detail, including what the drawing leaves out.
 */
export async function Pipeline({ stages, hooks = [], standalone = [], caption, locale }: { stages: PipelineStage[]; caption: string; locale: Locale } & PipelineExtras) {
  if (!stages.length) return null;
  const dl = await getTranslations({ locale, namespace: "devline" });
  const notes = dl.raw("flowShort") as Record<string, string>;
  const run = dl.raw("run") as Run;
  const steps = toSteps(stages, run.gateOf);
  const at = (k: string) => steps.findIndex((s) => s.key === k);
  const fanAt = steps.findIndex((s) => s.kind === "stage" && s.s.perTask);
  const loops = [
    { id: "replan", from: fanAt, to: at("plan"), text: run.replan, short: run.replanShort },
    { id: "iterate", from: at("gate"), to: at("plan"), text: run.iterate, short: run.iterateShort },
  ].filter((l) => l.from > 0 && l.to > 0);
  const tasks = [dl("flowTask", { n: 1 }), dl("flowTask", { n: 2 }), null, dl("flowTaskN")];

  const srAgent = (a: PipelineAgent, role?: string) =>
    `${a.id} (${[a.model, role, a.kb?.length && a.kb.join(", ")].filter(Boolean).join("; ")})`;
  const srStep = (st: Step) => {
    if (st.kind === "start") return run.start;
    if (st.kind === "end") return run.end;
    if (st.kind === "gate") return `${run.gate}: ${st.of}`;
    const { s } = st;
    return [
      `${s.label}${s.id && notes[s.id] ? `: ${notes[s.id]}` : ""}.`,
      s.skill && dl("run.srSkill", { skill: `/devline:${s.skill}` }) + ".",
      s.agents?.length && dl("run.srAgents", { agents: s.agents.map((a) => srAgent(a, run.agent[`${s.id}/${a.id}`])).join(", ") }) + ".",
      s.optional && run.srOptional,
      s.perTask && `${dl("flowEach")}.`,
    ]
      .filter(Boolean)
      .join(" ");
  };

  const gateMark = (
    <i className="vr-dia">
      <Icon name="check" />
    </i>
  );

  return (
    <RevealOnce className="vr-reveal" threshold={0.15}>
      <figure className="viz viz-run">
        <div className="sr-only">
          <p>{run.srKinds}</p>
          <p>{run.srSteps}</p>
          <ol>
            {steps.map((st) => (
              <li key={st.key}>{srStep(st)}</li>
            ))}
          </ol>
          <p>{run.srLoops}</p>
          <ul>
            <li>{dl("flowLoop")}</li>
            {loops.map((l) => (
              <li key={l.id}>{l.text}</li>
            ))}
            <li>
              {run.ladder}: {[...LADDER, run.lanes.you].join(ARROW)}
            </li>
          </ul>
        </div>

        <div className="vr-guard">
          <div className="vr-hooks">
            <p>
              <Icon name="shield" />
              <span aria-hidden="true">{dl("hooks")}</span>
              <span className="sr-only">{run.hooks}</span>
            </p>
            <ul>
              {hooks.map((h) => (
                <li key={h.id}>
                  <Tip id={`vr-hook-${h.id.replace(/\W/g, "-")}`} note={run.hook[h.id.replace(/\.sh$/, "") as keyof typeof run.hook]}>
                    <Icon name={h.id} />
                    <code>{h.id}</code>
                  </Tip>
                </li>
              ))}
            </ul>
          </div>

          <div
            className="vr-map"
            aria-hidden="true"
            style={{ "--n": steps.length, "--tpl": steps.map(track).join(" ") } as CSSProperties}
          >
            {(["you", "skills", "agents"] as const).map((l) => (
              <div key={l} className="vr-lane" data-lane={l}>
                <span>{run.lanes[l]}</span>
              </div>
            ))}

            {steps.map((st, r) => {
              const s = st.kind === "stage" ? st.s : null;
              const cell = { "--r": r } as CSSProperties;
              const you =
                st.kind === "start" ? <span className="vr-ev">{run.start}</span>
                : st.kind === "end" ? <span className="vr-ev">{run.end}</span>
                : st.kind === "gate" ? <span className="vr-gl">{st.of}</span>
                : null;
              return (
                <Fragment key={st.key}>
                  <div className="vr-c vr-you" style={cell} data-kind={st.kind} data-optional={s?.optional ? "" : undefined}>
                    {you}
                    {s?.optional && <span className="vr-skip">{run.skip}</span>}
                  </div>

                  <div
                    className="vr-c vr-skill"
                    style={cell}
                    data-step={st.key}
                    data-kind={st.kind}
                    data-gate={st.kind === "gate" ? "" : undefined}
                    data-optional={s?.optional ? "" : undefined}
                  >
                    {st.kind === "gate" ? gateMark : <i className="vr-node" />}
                    <i className="vr-tok" />
                    {s ? (
                      <div className="vr-card" data-fan={s.perTask ? "" : undefined}>
                        <span className="vr-name">{s.label}</span>
                        {s.perTask && (
                          <div className="vr-fan">
                            <ul>
                              {tasks.map((t, k) => (
                                <li key={k} data-more={t ? undefined : ""} style={{ "--k": k } as CSSProperties}>
                                  <span className="vr-task">{t}</span>
                                  <i className="vr-wire">
                                    <b className="vr-ftok" />
                                  </i>
                                  <span className="vr-rev">{t && <Icon name="reviewer" />}</span>
                                </li>
                              ))}
                            </ul>
                            <span className="vr-fix">
                              <span className="vr-glyph">{"↺"}</span> {run.fix}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      you && <span className="vr-inline">{you}</span>
                    )}
                  </div>

                  <div className="vr-c vr-agents" style={cell} data-kind={st.kind} data-optional={s?.optional ? "" : undefined}>
                    {s?.agents?.length ? (
                      <ul>
                        {s.agents.map((a) => (
                          <li key={a.id} data-agent={a.id}>
                            <Agent a={a} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </Fragment>
              );
            })}

            {loops.map((l, k) => (
              <div key={l.id} className="vr-loop" data-loop={l.id} style={{ "--a": l.to, "--b": l.from, "--k": k } as CSSProperties}>
                {["1", "2", "3"].map((n) => (
                  <i key={n} className="vr-seg" data-s={n}>
                    <b />
                  </i>
                ))}
                <span>{l.short}</span>
              </div>
            ))}
          </div>
        </div>

        {standalone.length > 0 && (
          <div className="vr-alone">
            <p>{run.alone}</p>
            <ul>
              {standalone.map((c) => (
                <li key={c.id}>
                  <Tip
                    id={`vr-alone-${c.id}`}
                    note={
                      <>
                        {run.aloneNote[c.id]}
                        {c.agents?.length ? <span className="sr-only"> {dl("run.srRuns", { agents: c.agents.map((a) => srAgent(a)).join(", ") })}</span> : null}
                      </>
                    }
                  >
                    <Icon name="skill" />
                    <span>{c.id}</span>
                    <span className="sr-only">{c.command}</span>
                  </Tip>
                  {c.agents?.map((a) => (
                    <span key={a.id} className="vr-runs" aria-hidden="true">
                      <Icon name={a.id} />
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="vr-key" aria-hidden="true">
          <span>
            <i className="vr-kskill">
              <Icon name="skill" />
            </i>
            {run.kinds.skill}
          </span>
          <span>
            <i className="vr-kagent">
              <Icon name="implementer" />
            </i>
            {run.kinds.agent}
          </span>
          <span>
            <i className="vr-kkb">
              <Icon name="kb" />
            </i>
            {run.kinds.kb}
          </span>
          <span>
            {gateMark}
            {run.gate}
          </span>
          <span>
            <span className="vr-bars">
              {PIPS.map((n) => (
                <i key={n} data-on="" />
              ))}
            </span>
            {run.cap}
          </span>
          <span>
            <span className="vr-coins">
              {PIPS.map((n) => (
                <i key={n} data-on="" />
              ))}
            </span>
            {run.cost}
          </span>
        </p>

        <figcaption>{caption}</figcaption>
      </figure>
    </RevealOnce>
  );
}
