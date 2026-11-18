import type { MDXComponents } from "mdx/types";
import { getTranslations } from "next-intl/server";
import { INVOICE_SOURCE } from "@/components/shared/bpmn/invoice-approval";
import { BpmnWhat, RoundTrip as RoundTripSteps } from "@/components/shared/bpmn/explainer";
import { ActionLink } from "@/components/shared/action-link";
import { encodeShare } from "@/lib/playground/share";
import { softwareSourceCodeJsonLd, thesisJsonLd } from "@/lib/seo";
import { siteConfig } from "@/lib/site-config";
import type { GithubData } from "@/lib/github";
import type { BpmnscriptArticle, HomeContent } from "@/lib/types";
import { articleContext } from "../mdx-article";
import "./bpmnscript.css";

/** The round-trip steps with the counts from the article's `funnel`; the caption (prose) comes from the MDX. */
function RoundTrip({ caption }: { caption: string }) {
  const { data, locale } = articleContext<"bpmnscript">();
  return (
    <div className="bs-roundtrip">
      <RoundTripSteps steps={data.funnel} caption={caption} locale={locale} lede={false} />
    </div>
  );
}

/** The invoice approval drawn beside its source with a plain-language gloss, and a link that opens the source in the playground. */
async function InvoiceExample() {
  const { locale } = articleContext();
  const [t, share] = await Promise.all([getTranslations({ locale, namespace: "bpmnscript" }), encodeShare(INVOICE_SOURCE)]);
  return (
    <>
      <div className="bs-example">
        <BpmnWhat locale={locale} />
      </div>
      {share.ok && (
        <p className="btn-row bs-open">
          <ActionLink href={`/playground#${share.hash}`} primary>
            {t("openInPlayground")}
          </ActionLink>
        </p>
      )}
    </>
  );
}

export const components: MDXComponents = { RoundTrip, InvoiceExample };

const THESIS = {
  name: "A Domain-Specific Language for Business Process Model and Notation",
  datePublished: "2026-10-27",
  inSupportOf: "B.Sc. Wirtschaftsinformatik",
  sourceOrganization: "Universität Hamburg",
} as const;

/** The language as SoftwareSourceCode and the thesis it came from. */
export function jsonLd(data: BpmnscriptArticle, _home: HomeContent, github: GithubData | null): object[] {
  // Version only when GitHub reports one (github is null without a token).
  const repo = github?.repos[data.repo.toLowerCase()];
  const tag = repo?.latestRelease?.tag ?? repo?.latestTag ?? undefined;
  return [
    softwareSourceCodeJsonLd({
      name: "BPMNscript",
      // The lede's first sentence describes the language; the rest is about the thesis.
      description: data.meta.lede.split(/(?<=\.)\s/)[0],
      codeRepository: `https://github.com/${data.repo}`,
      license: "https://www.apache.org/licenses/LICENSE-2.0",
      programmingLanguage: "TypeScript",
      version: tag?.replace(/^v/, ""),
    }),
    thesisJsonLd({ ...THESIS, url: `${siteConfig.url}/thesis.pdf`, author: siteConfig.name, inLanguage: "en" }),
  ];
}
