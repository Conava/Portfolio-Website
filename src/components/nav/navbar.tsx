"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "./theme-toggle";
import { LocaleToggle } from "./locale-toggle";
import { DesignThemeSwitcher } from "@/components/ui/design-theme-switcher";
import { siteConfig } from "@/lib/site-config";
import { usePathname, useRouter, Link } from "@/i18n/navigation";
import { trackEvent } from "@/lib/analytics";

const sections = [
  "about",
  "experience",
  "education",
  "projects",
  // "certificates", // Uncomment when you have certificates to show
  // "publications", // Uncomment when you have publications to show
  "contact",
] as const;

export function Navbar() {
  const t = useTranslations("nav");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isProjectsPage = pathname.startsWith("/projects");

  useEffect(() => {
    const root = document.getElementById("scroll-root");
    if (!root) return;
    const handler = () => setScrolled(root.scrollTop > 50);
    root.addEventListener("scroll", handler, { passive: true });
    return () => root.removeEventListener("scroll", handler);
  }, []);

  function handleSectionNav(section: string) {
    trackEvent("nav-section", { section });
    if (isProjectsPage) {
      router.push(`/#${section}`);
    } else {
      document.getElementById(section)?.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <>
    <nav
      className={`site-nav fixed top-0 left-0 right-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? "nav-scrolled bg-[var(--color-bg)]/85 backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {isProjectsPage ? (
          <Link
            href="/"
            className="nav-logo text-lg font-bold text-[var(--color-accent)]"
          >
            {siteConfig.name}
          </Link>
        ) : (
          <button
            onClick={() => {
            const root = document.getElementById("scroll-root");
            if (!root) return;
            if (root.scrollTop < 1) {
              window.dispatchEvent(new CustomEvent("hero-replay"));
              return;
            }
            root.scrollTo({ top: 0, behavior: "smooth" });
            const check = () => {
              if (root.scrollTop < 5) {
                root.removeEventListener("scroll", check);
                window.dispatchEvent(new CustomEvent("hero-replay"));
              }
            };
            root.addEventListener("scroll", check, { passive: true });
          }}
            className="nav-logo text-lg font-bold text-[var(--color-accent)]"
          >
            {siteConfig.name}
          </button>
        )}

        <div className="hidden md:flex items-center gap-6">
          {sections.map((section) => (
            <button
              key={section}
              onClick={() => handleSectionNav(section)}
              className="nav-link text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              {t(section)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Hamburger - mobile only */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden flex flex-col gap-1.5 p-2 rounded-lg hover:bg-[var(--color-bg-card-hover)] transition-colors"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <motion.span
              animate={{ rotate: menuOpen ? 45 : 0, y: menuOpen ? 8 : 0 }}
              transition={{ duration: 0.2 }}
              className="block w-5 h-0.5 bg-[var(--color-text)] rounded-full"
            />
            <motion.span
              animate={{ opacity: menuOpen ? 0 : 1 }}
              transition={{ duration: 0.2 }}
              className="block w-5 h-0.5 bg-[var(--color-text)] rounded-full"
            />
            <motion.span
              animate={{ rotate: menuOpen ? -45 : 0, y: menuOpen ? -8 : 0 }}
              transition={{ duration: 0.2 }}
              className="block w-5 h-0.5 bg-[var(--color-text)] rounded-full"
            />
          </button>
          {/* Desktop-only toggles */}
          <div className="hidden md:flex items-center gap-2">
            <DesignThemeSwitcher />
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>

    {/* Backdrop */}
    <AnimatePresence>
      {menuOpen && (
        <motion.div
          key="mobile-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </AnimatePresence>

    {/* Menu panel */}
    <AnimatePresence>
      {menuOpen && (
        <motion.div
          key="mobile-panel"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed top-0 right-0 h-full w-72 z-50 bg-[var(--color-bg-card)] border-l border-[var(--color-border)] flex flex-col p-6 md:hidden"
        >
          <div className="flex justify-end mb-8">
            <button
              onClick={() => setMenuOpen(false)}
              className="p-2 rounded-lg hover:bg-[var(--color-bg-card-hover)] transition-colors"
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <nav className="flex flex-col gap-2 flex-1">
            {sections.map((section, i) => (
              <motion.button
                key={section}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => {
                  setMenuOpen(false);
                  setTimeout(() => handleSectionNav(section), 300);
                }}
                className="nav-link text-left px-4 py-3 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-card-hover)] transition-colors text-lg"
              >
                {t(section)}
              </motion.button>
            ))}
          </nav>

          <div className="flex items-center gap-3 pt-6 border-t border-[var(--color-border)]">
            <DesignThemeSwitcher dropUp />
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
