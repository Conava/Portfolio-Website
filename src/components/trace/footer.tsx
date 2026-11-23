import { getTranslations } from "next-intl/server";
import { DesignToggle } from "@/components/shared/controls/design-toggle";
import type { Design } from "@/lib/design";
import { siteConfig } from "@/lib/site-config";
import type { Locale } from "@/lib/types";
import "./chrome.css";

/** Trace footer: copyright, the text design switch, and the j/k hint (CSS shows it only where the keys work). */
export async function TraceFooter({ locale, design }: { locale: Locale; design: Design }) {
  const t = await getTranslations({ locale, namespace: "trace" });
  return (
    <footer className="t-ftr wrap">
      <p className="meta">
        © {new Date().getFullYear()} {siteConfig.name}, Hamburg
      </p>
      <DesignToggle current={design} variant="text" via="footer" />
      <p className="t-keys micro">{t("keysHint")}</p>
    </footer>
  );
}
