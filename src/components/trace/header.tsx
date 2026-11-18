"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ResumeButton } from "@/components/shared/action-link";
import { ColorModeToggle } from "@/components/shared/controls/color-mode-toggle";
import { DesignToggle } from "@/components/shared/controls/design-toggle";
import { LocaleToggle } from "@/components/shared/controls/locale-toggle";
import { Link, usePathname } from "@/i18n/navigation";
import type { Design } from "@/lib/design-values";
import { siteConfig } from "@/lib/site-config";
import type { Locale } from "@/lib/types";
import { useCurrentStation } from "./rail";
import "./chrome.css";

/** The project page's own title (its h1), read once the page has rendered. */
function usePageName(pathname: string): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setName(/^\/(projects\/[^/]+|bpmnscript|dux|devline)$/.test(pathname) ? (document.querySelector("main h1")?.textContent ?? null) : null);
  }, [pathname]);
  return name;
}

/**
 * Trace header: brand pad + name, the crumb, and the utilities. On `/` the
 * crumb names the current station (the rail replaces it at >= 1180 px); on
 * other pages it names the page.
 */
export function TraceHeader({ locale, design }: { locale: Locale; design: Design }) {
  const t = useTranslations();
  const pathname = usePathname();
  const home = pathname === "/";
  const station = useCurrentStation(home);
  const pageName = usePageName(pathname);
  const crumb = home
    ? t(`nav.${station ?? "start"}`)
    : pathname === "/projects"
      ? t("projects.all")
      : pageName;

  // Fade only on a change, never on load (nothing enters on load).
  const [fade, setFade] = useState(false);
  const first = useRef(crumb);
  useEffect(() => {
    if (first.current === null) first.current = crumb;
    else if (crumb !== first.current) setFade(true);
  }, [crumb]);

  return (
    <header className="t-hdr" data-home={home ? "" : undefined}>
      <div className="t-hdr-in">
        <Link href="/" className="t-brand">
          <span className="t-brand-pad" aria-hidden="true" />
          <span className="t-brand-name">{siteConfig.name}</span>
        </Link>
        {crumb && (
          <span className="t-crumb">
            <span aria-hidden="true">/</span>
            <span key={crumb} className={fade ? "t-crumb-fade" : undefined}>
              {crumb}
            </span>
          </span>
        )}
        <div className="t-utils">
          <ResumeButton />
          <LocaleToggle current={locale} />
          <ColorModeToggle />
          <DesignToggle current={design} variant="icon" via="header" />
        </div>
      </div>
    </header>
  );
}
