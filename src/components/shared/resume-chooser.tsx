"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { sectionOf } from "@/lib/analytics";
import type { Locale } from "@/lib/types";
import "./resume-chooser.css";

/**
 * Clicks on any `/resume.pdf` link open a dialog to pick the German or the international version,
 * page language first. Modified clicks and no-JS visitors go straight to `/resume.pdf`.
 */
export function ResumeChooser({ locale }: { locale: Locale }) {
  const t = useTranslations("resumeChooser");
  const ref = useRef<HTMLDialogElement>(null);
  const [section, setSection] = useState("page");

  useEffect(() => {
    // Window capture runs before the analytics listener on document, which skips prevented clicks.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href="/resume.pdf"]');
      if (!a || ref.current?.contains(a)) return;
      e.preventDefault();
      setSection(sectionOf(a));
      ref.current?.showModal();
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);

  const versions = [
    { id: "de", href: "/resume-de.pdf", lang: "de" },
    { id: "en", href: "/resume.pdf", lang: "en" },
  ] as const;
  const ordered = locale === "de" ? versions : [...versions].reverse();
  const close = () => ref.current?.close();

  return (
    <dialog
      ref={ref}
      className="resume-chooser"
      aria-labelledby="resume-chooser-title"
      data-section={section}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="rc-body">
        <p id="resume-chooser-title" className="rc-title">{t("title")}</p>
        <ul className="rc-list">
          {ordered.map((v) => (
            <li key={v.id}>
              <a className="btn rc-option" href={v.href} hrefLang={v.lang} onClick={close}>
                {t(v.id)}
                <span aria-hidden="true">↓</span>
              </a>
            </li>
          ))}
        </ul>
        <button type="button" className="rc-close" onClick={close} aria-label={t("close")}>
          ×
        </button>
      </div>
    </dialog>
  );
}
