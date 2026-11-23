import { getTranslations } from "next-intl/server";
import { DesignToggle } from "@/components/shared/controls/design-toggle";
import { LocaleToggle } from "@/components/shared/controls/locale-toggle";
import { Link } from "@/i18n/navigation";
import type { Design } from "@/lib/design-values";
import { siteConfig } from "@/lib/site-config";
import type { Locale } from "@/lib/types";

/** Flow header: the name, the resume, language and design. No color mode switch: Flow is dark only. */
export async function FlowHeader({ locale, design }: { locale: Locale; design: Design }) {
  const t = await getTranslations({ locale, namespace: "hero" });
  return (
    <header className="fl-hdr">
      <div className="fl-hdr-in">
        <Link href="/" className="fl-brand">
          {siteConfig.name}
        </Link>
        <div className="fl-utils">
          {/* A file, so a plain link without the locale prefix. */}
          <a className="fl-resume" href="/resume.pdf">
            {t("resume")}
          </a>
          <LocaleToggle current={locale} />
          <DesignToggle current={design} variant="icon" via="header" />
        </div>
      </div>
    </header>
  );
}
