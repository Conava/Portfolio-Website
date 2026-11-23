import { getTranslations } from "next-intl/server";
import type { SectionProps } from "@/components/home-types";
import { ActionLink } from "@/components/shared/action-link";
import { BpmnWhat, RoundTrip, withCode } from "@/components/shared/bpmn/explainer";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { PanelBody } from "@/components/shared/panel/panel-body";
import "./bpmnscript.css";

/**
 * Flow BPMNscript beat body: the code the scene highlights, the intro, the round-trip steps, links and
 * panel. Returns the `.rv` items as siblings so the beat reveals them in turn. The code block
 * keeps `[data-code] .ln`: the scene marks the line its form is building.
 */
export async function FlowBpmnscript({ content, locale }: Pick<SectionProps, "content" | "locale">) {
  const t = await getTranslations();
  const { bpmnscript: b } = content;
  return (
    <>
      <p className="fl-kick rv" aria-hidden="true">
        {t("sections.bpmnscript")}
      </p>
      <div className="rv fl-bs-what">
        <BpmnWhat
          locale={locale}
          sample="code"
          code={
            <pre className="fl-code" data-code aria-label={t("scene.source")}>
              {b.sample.split("\n").map((l, i) => (
                <span key={i} className="ln">
                  {l}
                  {"\n"}
                </span>
              ))}
            </pre>
          }
        />
      </div>
      <p className="fl-p rv">{withCode(b.intro)}</p>
      <div className="rv fl-bs-rt">
        <RoundTrip steps={b.proof.steps} caption={b.proof.sentence} locale={locale} />
      </div>
      <p className="btn-row rv">
        {b.links.map((l) => (
          <ActionLink key={l.href} href={l.href} primary={l.href === "/bpmnscript"}>
            {l.label}
          </ActionLink>
        ))}
      </p>
      {b.panel && (
        <div className="rv">
          <DetailPanel id="bpmnscript" name={t("sections.bpmnscript")} section="bpmnscript">
            <PanelBody panel={b.panel} />
          </DetailPanel>
        </div>
      )}
    </>
  );
}
