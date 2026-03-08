"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { useDesignTheme } from "./design-theme-provider";
import { DESIGN_THEMES, THEME_META } from "@/lib/design-themes";

export function DesignThemeSwitcher({ dropUp = false }: { dropUp?: boolean }) {
  const { theme, setTheme } = useDesignTheme();
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("theme", theme);
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg-card-hover)] transition-colors"
        title="Design theme"
        aria-label="Switch design theme"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="grid grid-cols-2 gap-[3px] w-[18px] h-[18px]">
          {DESIGN_THEMES.map((themeKey) => (
            <span
              key={themeKey}
              className="rounded-[2px] transition-opacity"
              style={{
                background: THEME_META[themeKey].accent,
                opacity: mounted && themeKey === theme ? 1 : 0.3,
              }}
            />
          ))}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: dropUp ? 6 : -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: dropUp ? 6 : -6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={`absolute ${dropUp ? "bottom-[calc(100%+0.5rem)]" : "top-[calc(100%+0.5rem)]"} right-0 z-50 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 shadow-xl backdrop-blur-md flex flex-col gap-1 min-w-[220px]`}
          >
            <p className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] px-2 pb-1">
              Design Theme
            </p>
            {DESIGN_THEMES.map((themeKey) => {
              const meta = THEME_META[themeKey];
              const isActive = themeKey === theme;
              return (
                <button
                  key={themeKey}
                  onClick={() => { setTheme(themeKey); setOpen(false); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    isActive
                      ? "bg-[var(--color-accent)]/10 text-[var(--color-text)]"
                      : "hover:bg-[var(--color-bg-card-hover)] text-[var(--color-text-muted)]"
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{
                      background: meta.accent,
                      boxShadow: isActive ? `0 0 8px ${meta.accent}80` : "none",
                    }}
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium leading-none mb-0.5">{meta.label}</span>
                    <span className="text-[10px] opacity-60 leading-none">{meta.description}</span>
                  </span>
                  {isActive && (
                    <span className="ml-auto text-[var(--color-accent)] text-xs">✓</span>
                  )}
                </button>
              );
            })}

            <div className="mt-1 pt-2 border-t border-[var(--color-border)]">
              <button
                onClick={copyLink}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card-hover)] transition-colors w-full"
              >
                <span className="text-base leading-none">🔗</span>
                {copied ? t("copied") : t("copy_link")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
