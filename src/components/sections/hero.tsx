"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useDesignTheme } from "@/components/ui/design-theme-provider";
import { DEFAULT_THEME } from "@/lib/design-themes";

function go(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

export function Hero({ name, projectCount }: { name: string; projectCount: number }) {
  const t = useTranslations("hero");
  const { theme } = useDesignTheme();
  const [mounted, setMounted] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const handler = () => setReplayKey(k => k + 1);
    window.addEventListener("hero-replay", handler);
    return () => window.removeEventListener("hero-replay", handler);
  }, []);
  const yearsExp = new Date().getFullYear() - 2022;

  // Use default theme as key until mounted to avoid hydration mismatch
  // (server renders with DEFAULT_THEME, client may read a different theme from localStorage)
  const stableTheme = mounted ? theme : DEFAULT_THEME;

  const parts = name.trim().split(/\s+/);
  const firstName = parts[0] ?? name;
  const lastName = parts.slice(1).join(" ");

  return (
    <div key={`${stableTheme}-${replayKey}`}>
      {/* ══════════════════════════════════════════
          ATELIER — luxury editorial
          Gold rules draw in, italic Cormorant fills
          the viewport, side column floats right
      ══════════════════════════════════════════ */}
      <section className="hero-section hero-atelier relative min-h-[100svh] flex-col justify-center overflow-hidden px-[clamp(2rem,10vw,10rem)]">

        {/* Background watermark */}
        <div
          aria-hidden="true"
          className="hero-watermark absolute inset-0 flex items-center justify-center -z-10 overflow-hidden pointer-events-none select-none"
        >
          <span
            className="font-display italic font-light text-[var(--color-text)] whitespace-nowrap"
            style={{ fontSize: "clamp(8rem, 22vw, 18rem)", opacity: 0.025, letterSpacing: "0.15em" }}
          >
            PORTFOLIO
          </span>
        </div>

        {/* Top gold rule — draws left→right */}
        <div className="hero-rule w-full h-px bg-[var(--color-accent)]" />

        {/* Name + right column */}
        <div className="flex items-end justify-between gap-8 py-[clamp(3rem,8vh,6rem)]">
          <div>
            <p className="hero-greeting font-sans text-[0.6rem] tracking-[0.35em] uppercase text-[var(--color-text-muted)] mb-8">
              {t("greeting")}
            </p>
            <h1
              className="hero-name font-display font-light italic leading-[0.88] text-[var(--color-text)]"
              style={{ fontSize: "clamp(5rem,15vw,12rem)" }}
            >
              {name}
            </h1>
          </div>

          <div className="hero-meta hidden md:flex items-start gap-5 flex-shrink-0 pb-2">
            <div className="w-px h-36 bg-[var(--color-accent)] opacity-25" />
            <div className="space-y-4 pt-1">
              {[
                { v: `${yearsExp}+`, l: "Years" },
                { v: `${projectCount}+`, l: "Projects" },
                { v: "Java / Spring", l: "Stack" },
              ].map(({ v, l }) => (
                <div key={l} className="flex flex-col gap-0.5">
                  <span className="font-display italic text-[var(--color-accent)] text-lg leading-none">{v}</span>
                  <span className="font-sans text-[0.52rem] tracking-[0.28em] uppercase text-[var(--color-text-muted)]">{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTAs */}
        <div className="hero-cta flex items-center gap-8">
          <button
            onClick={() => go("projects")}
            className="font-sans text-[0.62rem] tracking-[0.2em] uppercase font-light border border-[var(--color-accent)] text-[var(--color-accent)] px-8 py-3.5 hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] transition-all duration-300"
          >
            {t("cta_projects")}
          </button>
          <button
            onClick={() => go("contact")}
            className="font-sans text-[0.62rem] tracking-[0.2em] uppercase font-light text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors flex items-center gap-2"
          >
            {t("cta_contact")}
            <span className="text-[var(--color-accent)]">↓</span>
          </button>
        </div>

        {/* Bottom rule */}
        <div className="hero-rule-bottom w-full h-px bg-[var(--color-border)] mt-[clamp(3rem,8vh,6rem)]" />

        {/* Scroll indicator */}
        <div className="hero-scroll absolute bottom-10 right-[clamp(2rem,10vw,10rem)] flex flex-col items-center gap-3">
          <span className="font-sans text-[0.48rem] tracking-[0.42em] uppercase text-[var(--color-text-muted)]">
            Scroll
          </span>
          <div className="relative w-px h-14 bg-[var(--color-border)] overflow-hidden">
            <div className="hero-scroll-fill absolute inset-0 bg-[var(--color-accent)]" />
          </div>
          <div className="hero-scroll-dot w-1 h-1 rounded-full bg-[var(--color-accent)]" />
        </div>
      </section>

      {/* ══════════════════════════════════════════
          MANIFESTO — acid editorial poster
          First name: filled yellow. Last name: hollow.
          Clip-path reveals left→right.
      ══════════════════════════════════════════ */}
      <section className="hero-section hero-manifesto relative min-h-[100svh] flex-col justify-center overflow-hidden px-[clamp(2rem,6vw,8rem)] py-24">

        {/* Background texture text */}
        <div
          aria-hidden="true"
          className="hero-bg-texture absolute inset-0 flex items-end justify-start -z-10 overflow-hidden pointer-events-none select-none"
        >
          <span
            className="font-sans font-black text-[var(--color-text)]"
            style={{ fontSize: "clamp(10rem, 30vw, 28rem)", opacity: 0.025, lineHeight: 0.85, letterSpacing: "-0.05em" }}
          >
            WORK
          </span>
        </div>

        {/* Counter + status */}
        <div className="hero-counter flex items-center justify-between mb-16">
          <span className="font-sans text-[0.58rem] tracking-[0.22em] uppercase text-[var(--color-text-muted)]">
            00.
          </span>
          <span className="flex items-center gap-2 font-sans text-[0.58rem] tracking-[0.16em] uppercase text-[var(--color-text-muted)]">
            <span className="hero-dot w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
            Available
          </span>
        </div>

        {/* Marquee strip */}
        <div className="hero-marquee overflow-hidden mb-8 -mx-[clamp(2rem,6vw,8rem)]">
          <div className="hero-marquee-track flex gap-0 whitespace-nowrap font-sans text-[0.55rem] tracking-[0.28em] uppercase text-[var(--color-text-muted)] border-t border-b border-[var(--color-border)] py-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="flex-shrink-0 px-4">
                AVAILABLE FOR HIRE&nbsp;&nbsp;·&nbsp;&nbsp;FULL STACK&nbsp;&nbsp;·&nbsp;&nbsp;2026&nbsp;&nbsp;·&nbsp;&nbsp;OPEN SOURCE&nbsp;&nbsp;·&nbsp;&nbsp;
              </span>
            ))}
          </div>
        </div>

        {/* Name: filled first word */}
        <h1
          className="hero-name-first font-display font-extrabold italic leading-[0.82] text-[var(--color-accent)]"
          style={{ fontSize: "clamp(4.5rem,17vw,13rem)" }}
        >
          {firstName}
        </h1>

        {/* Name: outlined second word */}
        {lastName && (
          <h1
            className="hero-name-last font-display font-extrabold italic leading-[0.82]"
            style={{
              fontSize: "clamp(4.5rem,17vw,13rem)",
              WebkitTextStroke: "2px var(--color-text)",
              color: "transparent",
            }}
          >
            {lastName}
          </h1>
        )}

        {/* Stats row */}
        <div className="hero-stats-row flex items-center gap-6 mt-4 font-sans text-[0.58rem] tracking-[0.18em] uppercase text-[var(--color-text-muted)]">
          <span><span className="text-[var(--color-accent)] font-bold text-sm mr-1">{yearsExp}+</span>yrs</span>
          <span className="text-[var(--color-border)]">/</span>
          <span><span className="text-[var(--color-accent)] font-bold text-sm mr-1">{projectCount}+</span>proj</span>
          <span className="text-[var(--color-border)]">/</span>
          <span><span className="text-[var(--color-accent)] font-bold text-sm mr-1">Java / Spring</span>stack</span>
        </div>

        {/* Divider */}
        <div className="hero-rule w-full h-px bg-[var(--color-border)] my-8" />

        {/* Tagline + CTAs */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <p className="hero-tagline font-sans text-sm text-[var(--color-text-muted)] max-w-xs leading-relaxed">
            {t("tagline")}
          </p>
          <div className="hero-cta flex gap-3">
            <button
              onClick={() => go("projects")}
              className="theme-btn-primary font-sans text-[0.62rem] tracking-[0.15em] uppercase px-6 py-3 bg-[var(--color-accent)] text-[var(--color-bg)] font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              {t("cta_projects")} ↗
            </button>
            <button
              onClick={() => go("contact")}
              className="theme-btn-ghost font-sans text-[0.62rem] tracking-[0.15em] uppercase px-6 py-3 border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-text)] transition-colors"
            >
              {t("cta_contact")} ↗
            </button>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="hero-scroll absolute bottom-10 left-[clamp(2rem,6vw,8rem)] flex items-center gap-4">
          <div className="hero-scroll-arrow font-sans font-black text-[var(--color-accent)] text-2xl leading-none">↓</div>
          <span className="font-sans text-[0.5rem] tracking-[0.38em] uppercase text-[var(--color-text-muted)]">
            Scroll Down
          </span>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          COBALT — mission control
          Status bar + name + bordered stats panel.
          Dot-grid from CSS is the background.
      ══════════════════════════════════════════ */}
      <section className="hero-section hero-cobalt relative min-h-[100svh] flex-col justify-center overflow-hidden px-8 md:px-16 lg:px-24">

        {/* Scanline overlay */}
        <div
          aria-hidden="true"
          className="hero-scanlines absolute inset-0 pointer-events-none -z-10"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(37,99,235,0.015) 2px, rgba(37,99,235,0.015) 4px)",
            backgroundSize: "100% 4px",
          }}
        />

        {/* Corner coordinates */}
        <div
          aria-hidden="true"
          className="hero-coords absolute top-8 right-8 font-mono text-[0.45rem] tracking-[0.18em] text-[var(--color-accent)] opacity-30 pointer-events-none select-none hidden md:block"
        >
          <div>LAT 37.7749° N</div>
          <div>LNG 122.4194° W</div>
          <div className="mt-1 opacity-60">REF: {`{0x4D4C}`}</div>
        </div>

        {/* Ambient blobs */}
        <div className="hero-blobs absolute inset-0 -z-10">
          <div
            className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl"
            style={{ background: "var(--color-accent-glow)" }}
          />
          <div
            className="absolute bottom-1/3 right-1/4 w-64 h-64 rounded-full blur-3xl"
            style={{ background: "var(--color-accent-glow)", opacity: 0.5 }}
          />
        </div>

        {/* Status bar */}
        <div className="hero-status flex items-center gap-6 mb-14 font-mono text-[0.55rem] tracking-[0.22em] uppercase text-[var(--color-text-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="hero-dot w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
            Sys.Online
          </span>
          <span className="font-medium text-[var(--color-accent)]">● Available</span>
          <span className="ml-auto hidden md:block opacity-50 font-mono">
            {`// portfolio.v2`}
          </span>
        </div>

        {/* Name + stats */}
        <div className="flex flex-col md:flex-row md:items-end gap-10 md:gap-0">
          <div className="flex-1">
            <h1
              className="hero-name font-sans font-bold leading-[0.85] tracking-tight"
              style={{ fontSize: "clamp(3.5rem,10vw,9rem)" }}
            >
              {name}
            </h1>
            <div
              className="hero-rule h-px bg-[var(--color-accent)] mt-6 mb-4"
              style={{ transformOrigin: "left" }}
            />
            <p className="hero-tagline font-mono text-[0.6rem] tracking-[0.18em] uppercase text-[var(--color-text-muted)]">
              {t("tagline")}
            </p>
            <p className="hero-typewriter font-mono text-[0.58rem] text-[var(--color-accent)] mt-2 opacity-70">
              <span>&gt; initializing portfolio</span>
              <span className="hero-cursor">_</span>
            </p>
          </div>

          {/* Stats column */}
          <div className="hero-stats md:pl-12 md:border-l border-[var(--color-border)] flex flex-row md:flex-col gap-6 md:gap-0">
            {[
              { v: `${yearsExp}+`, l: "Years exp." },
              { v: `${projectCount}+`, l: "Projects" },
              { v: "Java / Spring", l: "Main stack" },
            ].map(({ v, l }, i) => (
              <div
                key={l}
                className={`md:py-4 ${i < 2 ? "md:border-b border-[var(--color-border)]" : ""}`}
              >
                <p className="font-mono text-xl font-bold text-[var(--color-accent)]">{v}</p>
                <p className="font-mono text-[0.52rem] tracking-[0.15em] uppercase text-[var(--color-text-muted)] mt-0.5">
                  {l}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div className="hero-cta flex gap-4 mt-12 flex-wrap">
          <button
            onClick={() => go("projects")}
            className="theme-btn-primary font-mono text-[0.62rem] tracking-[0.15em] uppercase px-8 py-3 bg-[var(--color-accent)] text-white rounded-full hover:bg-[var(--color-accent-hover)] transition-colors"
            style={{ boxShadow: "0 0 24px var(--color-accent-glow)" }}
          >
            {t("cta_projects")}
          </button>
          <button
            onClick={() => go("contact")}
            className="theme-btn-ghost font-mono text-[0.62rem] tracking-[0.15em] uppercase px-8 py-3 rounded-full border border-[var(--color-border)] hover:bg-[var(--color-bg-card-hover)] transition-colors"
          >
            {t("cta_contact")}
          </button>
        </div>

        {/* HUD metrics panel */}
        <div
          className="hero-hud hidden lg:block absolute bottom-24 right-8 font-mono text-[0.48rem] tracking-[0.12em] border border-[var(--color-accent)]/20 p-3 space-y-1.5 min-w-[160px]"
          style={{ background: "rgba(6,12,23,0.8)", backdropFilter: "blur(4px)" }}
        >
          <div className="text-[var(--color-accent)] opacity-50 mb-2 text-[0.4rem] tracking-[0.22em] uppercase">sys.metrics</div>
          {[
            { k: "UPTIME", v: "99.9%" },
            { k: "BUILD", v: "PASSING" },
            { k: "STATUS", v: "ONLINE" },
          ].map(({ k, v }) => (
            <div key={k} className="flex justify-between gap-6">
              <span className="text-[var(--color-text-muted)]">{k}</span>
              <span className="text-[var(--color-accent)]">{v}</span>
            </div>
          ))}
        </div>

        {/* Scroll hint */}
        <div className="hero-scroll absolute bottom-10 left-8 md:left-16 lg:left-24 flex items-center gap-2 font-mono text-[0.5rem] tracking-[0.22em] text-[var(--color-text-muted)]">
          <span className="text-[var(--color-accent)]">[</span>
          <div className="hero-scroll-arrow text-[var(--color-accent)]">↓</div>
          <span className="text-[var(--color-accent)]">]</span>
          <span className="ml-2 opacity-50">SCROLL</span>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          IRIS — dreamscape
          Concentric glowing rings, gradient name,
          gentle float animation.
      ══════════════════════════════════════════ */}
      <section className="hero-section hero-iris relative min-h-[100svh] items-center justify-center overflow-hidden">

        {/* Constellation dots */}
        <div aria-hidden="true" className="hero-constellation absolute inset-0 -z-10 pointer-events-none overflow-hidden">
          {[
            { x: "15%", y: "20%", size: 2 }, { x: "82%", y: "15%", size: 1.5 },
            { x: "60%", y: "75%", size: 2 }, { x: "25%", y: "65%", size: 1.5 },
            { x: "90%", y: "55%", size: 2 }, { x: "45%", y: "10%", size: 1 },
            { x: "70%", y: "40%", size: 1.5 }, { x: "10%", y: "85%", size: 1 },
            { x: "55%", y: "90%", size: 2 }, { x: "35%", y: "35%", size: 1 },
          ].map(({ x, y, size }, i) => (
            <div
              key={i}
              className="hero-star absolute rounded-full"
              style={{
                left: x, top: y,
                width: size, height: size,
                background: "var(--color-accent)",
                opacity: 0.3 + (i % 3) * 0.15,
                boxShadow: `0 0 ${size * 3}px var(--color-accent)`,
              }}
            />
          ))}
        </div>

        {/* Rings + blobs */}
        <div className="absolute inset-0 flex items-center justify-center -z-10">
          {[700, 520, 360, 210].map((size, i) => (
            <div
              key={size}
              className="hero-ring absolute rounded-full border"
              style={{
                width: size,
                height: size,
                borderColor: `rgba(124,58,237,${0.06 + i * 0.04})`,
                boxShadow: `0 0 ${60 - i * 10}px rgba(124,58,237,${0.07 - i * 0.015})`,
              }}
            />
          ))}
          <div
            className="hero-blob-a absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl"
            style={{ background: "var(--color-accent-glow)" }}
          />
          <div
            className="hero-blob-b absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl"
            style={{ background: "var(--color-accent-glow)" }}
          />
        </div>

        {/* Content */}
        <div className="text-center px-6">
          <p className="hero-greeting font-sans text-sm tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-8">
            {t("greeting")}
          </p>

          <p
            className="hero-subtitle font-sans text-xs tracking-[0.25em] uppercase mb-3"
            style={{
              background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Creative Technologist
          </p>

          <h1
            className="hero-name font-sans font-bold leading-[0.9] tracking-tight mb-8"
            style={{
              fontSize: "clamp(3.5rem,10vw,9rem)",
              background:
                "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {name}
          </h1>

          <p className="hero-tagline font-sans text-lg text-[var(--color-text-muted)] mb-12 max-w-md mx-auto">
            {t("tagline")}
          </p>

          {/* Glowing stat pills */}
          <div className="hero-stat-pills flex gap-3 justify-center flex-wrap mb-8">
            {[
              { v: `${yearsExp}+ yrs`, l: "experience" },
              { v: `${projectCount}+ proj`, l: "shipped" },
              { v: "Java / Spring", l: "main stack" },
            ].map(({ v, l }) => (
              <div
                key={l}
                className="hero-stat-pill flex flex-col items-center px-4 py-2 rounded-full border border-[var(--color-accent)]/25"
                style={{ background: "rgba(124,58,237,0.08)", backdropFilter: "blur(4px)" }}
              >
                <span className="font-sans font-semibold text-[var(--color-accent)] text-xs leading-none">{v}</span>
                <span className="font-sans text-[0.42rem] tracking-[0.18em] uppercase text-[var(--color-text-muted)] mt-0.5 leading-none">{l}</span>
              </div>
            ))}
          </div>

          <div className="hero-cta flex gap-4 justify-center flex-wrap">
            <button
              onClick={() => go("projects")}
              className="theme-btn-primary px-8 py-3 rounded-full font-sans font-medium transition-all duration-300"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)",
                color: "white",
                boxShadow: "0 0 32px var(--color-accent-glow)",
              }}
            >
              {t("cta_projects")}
            </button>
            <button
              onClick={() => go("contact")}
              className="theme-btn-ghost px-8 py-3 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card-hover)] transition-colors"
            >
              {t("cta_contact")}
            </button>
          </div>
        </div>

        {/* Chevron scroll hint */}
        <div className="hero-scroll absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="hero-chevron font-sans text-[var(--color-accent)] text-xs leading-none"
              style={{ opacity: 0.3 + i * 0.25 }}
            >
              ∨
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
