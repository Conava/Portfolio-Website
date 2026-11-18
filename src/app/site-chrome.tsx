import { getTranslations } from "next-intl/server";
import { FlowFooter } from "@/components/flow/footer";
import { FlowHeader } from "@/components/flow/header";
import { InkFooter } from "@/components/ink/footer";
import { InkHeader } from "@/components/ink/header";
import { TypeFooter } from "@/components/type/footer";
import { TypeHeader } from "@/components/type/header";
import { PANEL_HASH_SCRIPT } from "@/components/shared/panel/panel-hash-script";
import { TraceFooter } from "@/components/trace/footer";
import { TraceHeader } from "@/components/trace/header";
import type { Design } from "@/lib/design";
import type { Locale } from "@/lib/types";

const HEADERS = { keynote: InkHeader, thread: TraceHeader, flow: FlowHeader, type: TypeHeader };
const FOOTERS = { keynote: InkFooter, thread: TraceFooter, flow: FlowFooter, type: TypeFooter };

/** Skip link, the design's header and footer around a page. Routes outside `(site)` have none. */
export async function SiteChrome({
  locale,
  design,
  children,
}: {
  locale: Locale;
  design: Design;
  children: React.ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "nav" });
  const chrome = { locale, design };
  const Header = HEADERS[design];
  const Footer = FOOTERS[design];
  return (
    <>
      <a className="skip sr-only focus:not-sr-only" href="#main">
        {t("skip")}
      </a>
      <Header {...chrome} />
      {children}
      <script dangerouslySetInnerHTML={{ __html: PANEL_HASH_SCRIPT }} />
      <Footer {...chrome} />
    </>
  );
}
