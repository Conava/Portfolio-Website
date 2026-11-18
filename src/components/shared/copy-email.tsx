"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { trackEvent } from "@/lib/analytics";
import "./media.css";

/** Copies the address (a button, not mailto: the delegated listener counts mailto clicks as email_click). */
export function CopyEmail({ email, section, className }: { email: string; section: string; className?: string }) {
  const t = useTranslations("contact");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const text = useRef<HTMLSpanElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      // ponytail: no execCommand fallback; selecting lets the visitor copy by hand
      if (text.current) getSelection()?.selectAllChildren(text.current);
      return;
    }
    trackEvent("email_copy", { section });
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <span className={`copy-email ${className ?? ""}`} data-copied={copied || undefined}>
      <button type="button" onClick={copy} aria-label={t("copy")} className="ce-btn">
        <span ref={text} className="ce-text">{email}</span>
        <svg className="ce-stroke" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M1 4 C 20 1, 40 5, 60 3 S 90 2, 99 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" pathLength={1} />
        </svg>
      </button>
      <span className="ce-status" aria-live="polite">{copied ? t("copied") : ""}</span>
    </span>
  );
}
