"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import "./sections/projects-contact.css";

/** Ink 404: the requested path in mono, struck through with one red stroke, then the message and a way home. */
export function InkNotFound() {
  const t = useTranslations("notFound");
  const path = usePathname();
  return (
    <section className="wrap ink-nf" data-tone="paper">
      <p className="ink-nf-path data">
        <span>{path}</span>
        <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M0 6 C 25 3, 60 8, 100 4" vectorEffect="non-scaling-stroke" />
        </svg>
      </p>
      <h1>{t("message")}</h1>
      <p>
        <Link href="/">{t("home")}</Link>
      </p>
    </section>
  );
}
