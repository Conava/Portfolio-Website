import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { SectionProps } from "@/components/home-types";
import { ActionLink } from "@/components/shared/action-link";
import { BpmnWhat, RoundTrip, withCode } from "@/components/shared/bpmn/explainer";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { PanelBody } from "@/components/shared/panel/panel-body";
import { formatNumber } from "@/lib/format";
import type { Ground } from "./room";
import "./bpmnscript.css";

/**
 * Type BPMNscript room interior: the language first (the diagram over its code, the notes, the intro and
 * links), then the round-trip evaluation as a supporting strip: its three counts and what they mean.
 * The test's steps open with the detail panel.
 */
export async function TypeBpmnscript({
  content,
  locale,
  ground,
  tag,
  far,
}: Pick<SectionProps, "content" | "locale"> & { ground: Ground; tag?: ReactNode; far?: ReactNode }) {
  const t = await getTranslations("sections");
  const m = await getTranslations("bpmnscript.method");
  const { bpmnscript: b } = content;
  const steps = b.proof.steps;
  return (
    <div className="ty-in" data-ground={ground} data-ty-in>
      {tag}
      <div className="ty-wrap">
        <div className="ty-bs-what" data-ty-focus>
          <BpmnWhat locale={locale} />
        </div>
        <p className="ty-lede ty-wide">{withCode(b.intro)}</p>
        <ul className="btn-row ty-links">
          {b.links.map((l) => (
            <li key={l.href}>
              <ActionLink href={l.href} primary={l.href === "/bpmnscript"}>
                {l.label}
              </ActionLink>
            </li>
          ))}
        </ul>
        {steps.length > 0 && (
          <figure className="ty-bs-eval">
            <h3 className="ty-bs-eval-h">{m("title")}</h3>
            <ol className="ty-bs-counts">
              {steps.map((s) => (
                <li key={s.label}>
                  <span className="ty-bs-n">{formatNumber(s.value, locale)}</span>
                  <span className="ty-bs-l">{s.label}</span>
                </li>
              ))}
            </ol>
            <figcaption className="ty-bs-eval-cap">{b.proof.sentence}</figcaption>
          </figure>
        )}
        {b.panel && (
          <DetailPanel id="bpmnscript" name={t("bpmnscript")} section="bpmnscript">
            <PanelBody panel={b.panel} level={3} viz={<RoundTrip steps={steps} caption={b.proof.sentence} locale={locale} />} />
          </DetailPanel>
        )}
      </div>
      {far}
    </div>
  );
}
