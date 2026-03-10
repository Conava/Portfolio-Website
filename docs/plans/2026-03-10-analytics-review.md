# Review — analytics
Generated: 2026-03-10

## Batch Reviews

### Group 2: T04-T08

**Result: PASS**

**Tasks reviewed:** T04 (layout.tsx), T05 (hero.tsx), T06 (navbar.tsx), T07 (projects.tsx), T08 (footer.tsx)

**TypeScript:** `pnpm tsc --noEmit` passes with zero errors.

**Findings:** None above the confidence threshold (0.8). No in-scope issues were identified.

**Per-task assessment:**

- **T04**: `Script` imported from `next/script`. Both `NEXT_PUBLIC_UMAMI_URL` and `NEXT_PUBLIC_UMAMI_WEBSITE_ID` read at module level and guarded with `&&` before rendering. `strategy="afterInteractive"` and `data-website-id` set correctly.
- **T05**: All 8 CTA buttons instrumented — atelier, manifesto, cobalt, iris each with a `hero-cta-projects` and `hero-cta-contact` event. `trackEvent` is called before `go()`. Theme values are hardcoded per section as required. Existing scroll behavior unchanged.
- **T06**: `trackEvent("nav-section", { section })` added as the first line of `handleSectionNav` only. The logo/name button click handler is untouched. Both desktop and mobile nav paths go through `handleSectionNav`, so the single change covers both.
- **T07**: Card expand fires `project-expand` only when `!expanded` (correct old-value check before `setExpanded`). `e.stopPropagation()` is preserved on both the View Project `<Link>` and the GitHub `<a>` alongside the new `trackEvent` calls. Both "see all projects" `<Link>` elements — the hidden `md:inline-block` desktop link and the mobile `justify-center` link — have `onClick={() => trackEvent("see-all-projects")}`.
- **T08**: `onClick` added to the `<a>` tag inside the `.map()` callback, using `link.label.toLowerCase()` as the platform value. No `e.preventDefault()` added; links navigate normally.

**Summary:** All five tasks in Group 2 are implemented correctly and completely. The instrumentation is additive, type-safe, and consistent with the analytics helper module from Group 1. No regressions, no missing coverage, no edge cases overlooked.

## Stage 4: Deep Review

### Holistic Compliance — PASS
All tasks T01-T02, T04-T08 fully implemented. T03 (.env.example) blocked by file-guard hook — requires manual creation. No behavioral regressions found.

### Security Review
- [RESOLVED] Script src URL lacked origin validation — added `isValidUmamiUrl` check against `analytics.marlonkranz.com`
- [RESOLVED] Default Umami admin credentials (admin/umami) not warned about — added comment to docker-compose.umami.yml

### Code Quality Review
- [RESOLVED] DRY violation: hardcoded theme strings in hero CTAs — replaced with `stableTheme` variable
- [RESOLVED] Script tag placed inside `<head>` JSX — moved to `<body>` per Next.js convention
- [RESOLVED] `see-all-projects` lacked placement discriminator — added `{ placement: "header" | "bottom" }`

### Deferred
- [DEFERRED] T03 `.env.example` blocked by file-guard hook — requires manual creation by user
