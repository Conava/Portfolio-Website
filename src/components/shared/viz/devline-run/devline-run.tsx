"use client";

import { useEffect, useRef } from "react";
import type { DevlineRunViz } from "@/lib/types";
import { mountDevlineRun, STILLS } from "./engine";
import "./devline-run.css";

/**
 * The homepage devline block: one example run, stage by stage. The server renders the stages as
 * a list (the caption slots), the still frames' captions and the overview, so the text reads
 * without JS; the drawing is built on mount. While pinned, one scroll gesture moves one stage.
 * Live or still is decided by CSS media queries (scripting, reduced motion, viewport height),
 * which the engine mirrors, so nothing shifts when it mounts.
 */
export function DevlineRun({ viz }: { viz: DevlineRunViz }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return mountDevlineRun(el, viz);
  }, [viz]);

  const { parts } = viz;
  return (
    <figure ref={ref} className="viz dlr">
      <h4 className="dlr-h">{viz.heading}</h4>
      <div className="dlr-scene">
        <div className="dlr-pin">
          <div className="dlr-capcol">
            <div className="dlr-cap">
              <ol className="dlr-rail" aria-hidden="true">
                {viz.stages.map((s) => (
                  <li key={s.id} />
                ))}
              </ol>
              <ol className="dlr-stages">
                {viz.stages.map((s) => (
                  <li key={s.id}>
                    <p className="nm">
                      {s.name}
                      {s.gate && <span className="gk"> {s.gate}</span>}
                    </p>
                    <p className="ln">{s.line}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="dlr-gslot" aria-hidden="true" />
          </div>
          <div className="dlr-obj" aria-hidden="true">
            <div className="dlr-box" />
          </div>
        </div>
      </div>
      <ol className="dlr-stills" aria-hidden="true">
        {STILLS.map((k) => (
          <li key={k}>
            <div className="dlr-shot" data-u={k} />
            <p>
              <b>{viz.stages[k]?.name}</b>
              <span>{viz.stages[k]?.line}</span>
            </p>
          </li>
        ))}
      </ol>

      <div className="dlr-parts">
        <h4>{parts.heading}</h4>
        <p className="dlr-key">
          <span>
            <i className="mk-alone" aria-hidden="true" />
            {parts.skills.alone}
          </span>
          <span>
            <i className="mk-default" aria-hidden="true" />
            {parts.agents.default}
          </span>
        </p>
        <ul>
          <li>
            <h5>{parts.skills.title}</h5>
            <p>{parts.skills.text}</p>
            <p className="dlr-grp">{parts.skills.pipeline}</p>
            <ul className="dlr-chips">
              {parts.skills.pipelineItems.map((s) => (
                <li key={s.name} data-alone={s.alone ? "" : undefined}>
                  <code>{s.name}</code>
                  {s.alone && <span className="sr-only"> ({parts.skills.alone})</span>}
                </li>
              ))}
            </ul>
            <p className="dlr-grp">{parts.skills.other}</p>
            <ul className="dlr-chips">
              {parts.skills.otherItems.map((n) => (
                <li key={n}>
                  <code>{n}</code>
                </li>
              ))}
            </ul>
          </li>
          <li>
            <h5>{parts.agents.title}</h5>
            <p>{parts.agents.text}</p>
            <ul className="dlr-agents">
              {parts.agents.items.map((a) => (
                <li key={a.name} data-default={a.default ? "" : undefined}>
                  <code>{a.name}</code>
                  <span className="dlr-model" data-model={a.model.toLowerCase()}>
                    {a.model}
                  </span>
                  <span className="dlr-role">{a.role}</span>
                  {a.default && <span className="sr-only"> ({parts.agents.default})</span>}
                </li>
              ))}
            </ul>
          </li>
          <li>
            <h5>{parts.knowledge.title}</h5>
            <p>{parts.knowledge.text}</p>
            <ul className="dlr-kb">
              {parts.knowledge.items.map((k) => (
                <li key={k.name}>
                  <code>{k.name}</code>
                  <span>{k.text}</span>
                  <span className="dlr-users">
                    {k.users.map((n) => (
                      <i key={n}>{n}</i>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </li>
          <li>
            <h5>{parts.hooks.title}</h5>
            <p>{parts.hooks.text}</p>
            <ul className="dlr-hk">
              {parts.hooks.rules.map((r) => (
                <li key={r.command} data-kind={r.kind}>
                  <i aria-hidden="true">{r.kind === "deny" ? "✕" : r.kind === "ask" ? "?" : "✓"}</i>
                  <code>{r.command}</code>
                  <b>{r.verdict}</b>
                </li>
              ))}
            </ul>
          </li>
        </ul>
      </div>
      <figcaption>{viz.caption}</figcaption>
    </figure>
  );
}
