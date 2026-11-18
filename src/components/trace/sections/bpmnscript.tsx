import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { INVOICE_XML } from "@/components/shared/bpmn/invoice-approval";
import { InvoiceDiagram } from "@/components/shared/bpmn/invoice-diagram";
import { SourceLines } from "@/components/shared/bpmn/source-lines";
import { ActionLink } from "@/components/shared/action-link";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { PanelBody } from "@/components/shared/panel/panel-body";
import { BpmnWhat, RoundTrip, withCode } from "@/components/shared/bpmn/explainer";
import { Pad } from "@/components/trace/pad";
import { BpmnScene } from "./bpmnscript-scene";
import { RevealOnce } from "@/components/shared/reveal-once";
import "./bpmnscript.css";

const FILE = "invoice-approval.bpmnscript";

/**
 * Trace BPMNscript: the intro and the three plain notes, the pinned editor window (source typed line by line while the
 * compiler's diagram builds, then the real compiled XML slides in), links, and the round-trip steps with their counts.
 */
export async function TraceBpmnscript({ content, locale }: SectionProps) {
  const t = await getTranslations("sections");
  const s = await getTranslations("scene");
  const tp = await getTranslations("projects");
  const { bpmnscript } = content;
  const { links } = bpmnscript;

  return (
    <TrackedSection id="bpmnscript" className="wrap t-bpm">
      <h2>
        <Pad station="bpmnscript" label={t("bpmnscript")} kind="section" />
        {t("bpmnscript")}
      </h2>
      <p className="lede">{withCode(bpmnscript.intro)}</p>
      <BpmnWhat locale={locale} sample="none" />

      <BpmnScene
        labels={{ source: s("source"), xml: s("xml"), diagram: s("diagram"), recording: s("recording"), replay: s("replay"), valid: s("valid") }}
        source={<SourceLines source={bpmnscript.sample} label={s("source")} />}
        diagram={<InvoiceDiagram />}
        xml={INVOICE_XML}
        terminal={s("compiled", { file: FILE })}
        links={
          links.length > 0 && (
            <p className="btn-row t-bpm-links">
              {links.map((l) => (
                <ActionLink key={l.href} href={l.href} primary={l.href === "/playground"}>
                  {l.label}
                </ActionLink>
              ))}
            </p>
          )
        }
      />

      <RevealOnce className="t-bpm-proof" threshold={0.5}>
        <RoundTrip steps={bpmnscript.proof.steps} caption={bpmnscript.proof.sentence} locale={locale} />
      </RevealOnce>
      {bpmnscript.panel && (
        <div className="t-bpm-more">
          <DetailPanel id="bpmnscript" name={t("bpmnscript")} section="bpmnscript" actions={<ActionLink href="/bpmnscript">{tp("article")}</ActionLink>}>
            <PanelBody panel={bpmnscript.panel} level={3} />
          </DetailPanel>
        </div>
      )}
    </TrackedSection>
  );
}
