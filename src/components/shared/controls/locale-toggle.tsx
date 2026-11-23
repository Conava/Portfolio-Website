"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { getPathname, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { trackEvent } from "@/lib/analytics";
import type { Locale } from "@/lib/types";
import { installNavContinuity, markNavigation } from "./nav-continuity";
import { useSiteSwitches } from "./site-switches";
import "./controls.css";

/** "EN DE": each item links to this page in that locale (`/de` prefix), query kept. Hidden while German is unpublished (`GERMAN` env). */
export function LocaleToggle({ current }: { current: Locale }) {
  const t = useTranslations("controls");
  const pathname = usePathname();
  const search = useSearchParams();
  const href = search.size ? { pathname, query: Object.fromEntries(search) } : pathname;
  const { german } = useSiteSwitches();
  useEffect(installNavContinuity, []);

  if (!german) return null;
  return (
    <span role="group" aria-label={t("language")} className="ctl-switch ctl-locale">
      {routing.locales.map((l) => (
        <a
          key={l}
          href={getPathname({ href, locale: l })}
          hrefLang={l}
          lang={l}
          aria-current={l === current ? "true" : undefined}
          className="ctl-item"
          onClick={(e) => {
            if (l === current) return;
            trackEvent("locale_switch", { from: current, to: l });
            markNavigation(e, false);
          }}
        >
          {l.toUpperCase()}
        </a>
      ))}
    </span>
  );
}
