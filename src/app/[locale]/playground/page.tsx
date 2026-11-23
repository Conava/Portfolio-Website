import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import meta from "@/generated/bpmnscript/meta.json";
import { InvoiceDiagram } from "@/components/shared/bpmn/invoice-diagram";
import { INVOICE_SOURCE, INVOICE_XML } from "@/components/shared/bpmn/invoice-approval";
import { SourceLines } from "@/components/shared/bpmn/source-lines";
import { PlaygroundApp } from "@/components/playground/playground-app";
import { getDesign } from "@/lib/design";
import { socialFor } from "@/lib/seo";

// English only: next.config.ts redirects /de/playground here, so the locale is always "en".
const locale = "en";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "playground.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/playground", languages: { en: "/playground", "x-default": "/playground" } },
    ...socialFor({
      title: t("title"),
      description: t("description"),
      locale,
      path: "/playground",
      image: { url: "/images/og/playground.jpg", alt: t("title"), width: 1200, height: 630 },
    }),
  };
}

/** Full-viewport playground, outside the site chrome. The server renders the default example as its resting frame. */
export default async function PlaygroundPage() {
  const [t, design] = await Promise.all([getTranslations({ locale, namespace: "playground" }), getDesign()]);

  return (
    <PlaygroundApp
      initialSource={INVOICE_SOURCE}
      initialXml={INVOICE_XML}
      fallbackEditor={<SourceLines source={INVOICE_SOURCE} label={t("tabs.source")} />}
      fallbackDiagram={<InvoiceDiagram eventLabels={false} />}
      version={meta.version}
      design={design}
    >
      <noscript>
        {/* Without JS the files, tools, tabs, panel and status can do nothing. */}
        <style>{`.pg-tools,.pg-tabs,.pg-bottom,.pg-status,.pg-side,.pg-etabs{display:none!important}.pg-main{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;grid-template-areas:"src out" "panel out"!important}@media(max-width:899.98px){.pg-main{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:minmax(0,1fr) minmax(0,1fr)!important;grid-template-areas:"src" "out"!important}.pg-src{grid-area:src!important;display:flex!important}.pg-out{grid-area:out!important;display:flex!important}}`}</style>
        <p className="pg-nojs">{t("noscript")}</p>
      </noscript>
    </PlaygroundApp>
  );
}
