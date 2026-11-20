import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { InvoiceDiagram } from "@/components/shared/bpmn/invoice-diagram";
import { SourceLines } from "@/components/shared/bpmn/source-lines";
import { ActionLink } from "@/components/shared/action-link";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { PanelBody } from "@/components/shared/panel/panel-body";
import { BpmnWhat, withCode } from "@/components/shared/bpmn/explainer";
import { BpmnScene } from "./bpmnscript-scene";
import { FunnelFigure } from "./funnel-figure";
import "./bpmnscript.css";

/**
 * Ink BPMNscript: the three plain notes, the intro, the pinned scene (source lines and the compiled diagram
 * build in step inside the playground window) and the round trip as a printed page with Figure 1.
 * Server markup is the scene's final state.
 */
export async function InkBpmnscript({ content, locale }: SectionProps) {
  const t = await getTranslations("sections");
  const s = await getTranslations("scene");
  const tp = await getTranslations("projects");
  const { bpmnscript: b } = content;
  const { links } = b;

  return (
    <TrackedSection id="bpmnscript" className="ink-bs">
      <div data-tone="paper" className="wrap ink-bs-intro">
        <h2>{t("bpmnscript")}</h2>
        <BpmnWhat locale={locale} sample="none" />
        <p className="lede">{withCode(b.intro)}</p>
      </div>

      <BpmnScene
        file="invoice-approval.bpmnscript"
        toolbar={[s("source"), s("diagram"), s("xml")]}
        recording={s("recording")}
        valid={s("valid")}
        replay={s("replay")}
        source={<SourceLines label={s("source")} />}
        diagram={<InvoiceDiagram />}
        links={
          links.length ? (
            <ul className="btn-row ink-bs-links">
              {links.map((l) => (
                <li key={l.href}>
                  <ActionLink href={l.href} primary={l.href.startsWith("/playground")}>
                    {l.label}
                  </ActionLink>
                </li>
              ))}
            </ul>
          ) : null
        }
      />

      <div data-tone="paper" className="wrap ink-bs-proof">
        <FunnelFigure steps={b.proof.steps} caption={b.proof.sentence} locale={locale} />
        {b.panel && (
          <div className="ink-bs-panel">
            <DetailPanel id="bpmnscript" name="BPMNscript" section="bpmnscript" actions={<ActionLink href="/bpmnscript">{tp("article")}</ActionLink>}>
              <PanelBody panel={b.panel} level={3} />
            </DetailPanel>
          </div>
        )}
      </div>
    </TrackedSection>
  );
}
