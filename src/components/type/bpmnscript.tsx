import type { CSSProperties, ReactNode } from "react";
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
 * Type BPMNscript room interior: diagram beside code, the intro, links, then the round-trip steps
 * beside a funnel of the three counts set as large type. The funnel repeats the steps' numbers,
 * so it is hidden from assistive tech.
 */
export async function TypeBpmnscript({
  content,
  locale,
  ground,
  tag,
  far,
}: Pick<SectionProps, "content" | "locale"> & { ground: Ground; tag?: ReactNode; far?: ReactNode }) {
  const t = await getTranslations("sections");
  const { bpmnscript: b } = content;
  const steps = b.proof.steps;
  const top = steps[0]?.value || 1;
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
        <div className="ty-bs-proof">
          <div className="ty-proof">
            <RoundTrip steps={steps} caption={b.proof.sentence} locale={locale} />
          </div>
          <div className="ty-funnel" aria-hidden="true">
            {steps.map((s, i) => (
              <div
                key={s.label}
                className="ty-fn"
                style={
                  {
                    "--w0": s.value / top,
                    "--w1": (steps[i + 1]?.value ?? s.value) / top,
                  } as CSSProperties
                }
              >
                <span className="ty-fn-n">{formatNumber(s.value, locale)}</span>
                <span className="ty-fn-l">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
        {b.panel && (
          <DetailPanel id="bpmnscript" name={t("bpmnscript")} section="bpmnscript">
            <PanelBody panel={b.panel} level={3} />
          </DetailPanel>
        )}
      </div>
      {far}
    </div>
  );
}
