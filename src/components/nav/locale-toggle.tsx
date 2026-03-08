"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/lib/types";

export function LocaleToggle() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  async function switchLocale() {
    const next = locale === "en" ? "de" : "en";
    // Signal template.tsx to play its exit animation
    window.dispatchEvent(new CustomEvent("locale-exit"));
    // Wait for exit animation duration before navigating
    await new Promise<void>((resolve) => setTimeout(resolve, 280));
    router.replace(pathname, { locale: next, scroll: false });
  }

  return (
    <button
      onClick={switchLocale}
      className="px-3 py-1.5 text-sm font-medium rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg-card-hover)] transition-colors"
      aria-label="Switch language"
    >
      {locale === "en" ? "DE" : "EN"}
    </button>
  );
}
