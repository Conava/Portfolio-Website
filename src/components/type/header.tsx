import { ColorModeToggle } from "@/components/shared/controls/color-mode-toggle";
import { DesignToggle } from "@/components/shared/controls/design-toggle";
import { LocaleToggle } from "@/components/shared/controls/locale-toggle";
import { Link } from "@/i18n/navigation";
import type { Design } from "@/lib/design-values";
import { siteConfig } from "@/lib/site-config";
import type { Locale } from "@/lib/types";
import "./chrome.css";

/** Type header: the name and the utilities, in the page (not fixed), so the facades own the screen. */
export function TypeHeader({
  locale,
  design,
}: {
  locale: Locale;
  design: Design;
}) {
  return (
    <header className="ty-hdr">
      <Link href="/" className="ty-brand">
        {siteConfig.name}
      </Link>
      <div className="ty-utils">
        <LocaleToggle current={locale} />
        <ColorModeToggle />
        <DesignToggle current={design} variant="icon" via="header" />
      </div>
    </header>
  );
}
