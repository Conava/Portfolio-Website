# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # Start dev server
pnpm build      # Production build
pnpm start      # Start production server
pnpm tsc --noEmit  # Type-check without emitting (no lint/test scripts)
```

No test or lint scripts are configured.

## Architecture

**Next.js 16 App Router** with all routes under `src/app/[locale]/`. The `[locale]` segment is handled by `next-intl` with path-based routing (EN/DE). Locale validation happens in `layout.tsx`; invalid locales call `notFound()`.

### Two Theming Layers

The app has two independent theming systems that compose:

1. **Dark/light mode** — managed by `next-themes`, stored in a `class` attribute on `<html>` (`.dark`). All four design themes have both a dark and a light variant.
2. **Design themes** — 4 visual palettes (cobalt, iris, manifesto, atelier) stored in `localStorage` under key `portfolio-design-theme` and applied as `data-theme` attribute on `<html>`. Defined in `src/lib/design-themes.ts`. Each theme overrides CSS custom properties in `src/app/globals.css` via `[data-theme="x"]` selectors. An inline `<script>` in `<head>` reads localStorage before hydration to prevent flash. The `DesignThemeProvider` context (`src/components/ui/design-theme-provider.tsx`) manages the active theme in React.

The default design theme is **Atelier**. CSS custom properties (`--color-bg`, `--color-accent`, `--font-sans`, `--card-radius`, etc.) are the single source of truth for all component styling — components must use `var(--color-*)` instead of hardcoded Tailwind color utilities.

### Content System

All site content lives in `content/{locale}/`:
- `data/` — JSON files: `experience.json`, `education.json`, `certificates.json`, `about.json`, `publications.json`
- `projects/` — MDX files with YAML frontmatter (`ProjectFrontmatter` type in `src/lib/types.ts`)

Server-side loaders in `src/lib/content.ts` read these at request time. Project slugs are derived from EN filenames; locale fallback to EN exists for both project MDX and publications JSON. The main `page.tsx` loads all content in parallel and filters entries with `hidden: true`.

### Section Visibility

Sections (Certificates, Publications) are shown/hidden based on content: if all entries have `hidden: true`, the section is omitted and its navbar link is excluded. **The navbar `sections` array in `src/components/nav/navbar.tsx` must be manually updated** when adding or removing sections — it is not auto-derived from content.

Section numbering uses `toRoman()` from `src/lib/utils.ts` and is computed dynamically in `page.tsx` based on which optional sections are visible.

### i18n

- UI strings: `messages/{locale}.json` — consumed via `useTranslations()` (client) or `getTranslations()` (server)
- Content strings: `content/{locale}/data/*.json` — loaded directly by `src/lib/content.ts`
- Navigation helpers: `src/i18n/navigation.ts` (re-exports from next-intl routing)

### Fonts

All 6 font families are loaded unconditionally at build time via `next/font/google` in `layout.tsx` and applied as CSS variables on `<html>`. Theme CSS overrides `--font-sans` and `--font-display` per `data-theme` to switch fonts when themes change.

### Key Files

| File | Purpose |
|---|---|
| `src/lib/design-themes.ts` | Theme names, metadata, default |
| `src/app/globals.css` | CSS custom properties for all 4 themes + special effects (grain, watermarks) |
| `src/lib/content.ts` | All filesystem content loaders |
| `src/lib/types.ts` | All shared TypeScript types |
| `src/lib/site-config.ts` | Name, social links — edit here to change personal info |
| `src/app/[locale]/page.tsx` | Main page — assembles all sections, controls section numbering |
| `src/components/nav/navbar.tsx` | Navigation — `sections` array must match page content |
| `content/{locale}/data/*.json` | Editable content |
| `content/{locale}/projects/*.mdx` | Project detail pages |
