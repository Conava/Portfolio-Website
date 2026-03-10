# Plan: Self-Hosted Umami Analytics

Date: 2026-03-10

<!-- SCHEDULING -->
| id | name | group | touches | depends_on |
|----|------|-------|---------|------------|
| T01 | Docker Compose reference file for Umami | 1 | docker-compose.umami.yml | -- |
| T02 | Analytics helper module and TypeScript declarations | 1 | src/lib/analytics.ts | -- |
| T03 | Environment variable documentation | 1 | .env.example | -- |
| T04 | Add Umami script tag to layout | 2 | src/app/[locale]/layout.tsx | T02, T03 |
| T05 | Instrument Hero CTA buttons | 2 | src/components/sections/hero.tsx | T02 |
| T06 | Instrument Navbar section navigation | 2 | src/components/nav/navbar.tsx | T02 |
| T07 | Instrument Projects section | 2 | src/components/sections/projects.tsx | T02 |
| T08 | Instrument Footer social links | 2 | src/components/sections/footer.tsx | T02 |
<!-- /SCHEDULING -->

---

## Task T01: Docker Compose reference file for Umami

### Context

The portfolio site runs as a Docker container behind Traefik on a server. Umami needs its own container alongside a PostgreSQL database. This task creates a standalone reference compose file that the user copies into their server's compose setup. It is infrastructure-only and touches no application code.

### Requirements

1. Create `docker-compose.umami.yml` at the repo root with two services: `umami` and `umami_db`.
2. `umami` service uses `ghcr.io/umami-software/umami:postgresql-latest`, exposes internal port 3000, depends on `umami_db` with `condition: service_healthy`.
3. `umami` service has Traefik labels routing `analytics.marlonkranz.com` to it (HTTP router + TLS via Let's Encrypt).
4. `umami` service reads `DATABASE_URL` composed from `${UMAMI_DB_PASSWORD}`, and `APP_SECRET` from `${UMAMI_APP_SECRET}`.
5. `umami_db` service uses `postgres:15-alpine`, stores data in a named volume `umami_db_data`, has a healthcheck using `pg_isready`.
6. `umami_db` is not exposed via Traefik (no labels, no published ports).
7. File includes a comment header explaining how to integrate it into the server compose file.

### Implementation Details

- File path: `/home/marlon/source/portfolio/docker-compose.umami.yml`
- Use env var substitution `${UMAMI_DB_PASSWORD}` and `${UMAMI_APP_SECRET}` (no defaults, intentionally fail if unset).
- `DATABASE_URL` format for Umami: `postgresql://umami:${UMAMI_DB_PASSWORD}@umami_db:5432/umami`
- Traefik labels pattern: `traefik.enable=true`, `traefik.http.routers.umami.rule=Host('analytics.marlonkranz.com')`, `traefik.http.routers.umami.tls.certresolver=letsencrypt`, `traefik.http.services.umami.loadbalancer.server.port=3000`.
- Healthcheck for `umami_db`: `pg_isready -U umami`, interval 10s, timeout 5s, retries 5.
- Define the `umami_db_data` volume at the bottom.
- Both services should join the external `web` network (standard Traefik pattern) and a private `umami_internal` network for DB communication.

### Edge Cases and Pitfalls

- Do not hardcode passwords in the file. Use `${UMAMI_DB_PASSWORD}` env var substitution only.
- The Traefik label host value must use backticks inside the compose YAML string to avoid YAML parsing issues. Use the form: ``Host(`analytics.marlonkranz.com`)``
- `umami_db` must not have any Traefik labels or port mappings to avoid accidental exposure.

### Test Approach

`dry-run` -- Validate the compose file is syntactically correct with `docker compose -f docker-compose.umami.yml config`. Visually confirm service definitions, labels, and volume.

### Acceptance Criteria

- [ ] `docker-compose.umami.yml` exists at repo root
- [ ] Contains `umami` and `umami_db` services
- [ ] `umami_db` has healthcheck and no published ports
- [ ] `umami` depends on `umami_db` healthy, has Traefik labels for `analytics.marlonkranz.com`
- [ ] Environment variables reference `${UMAMI_DB_PASSWORD}` and `${UMAMI_APP_SECRET}` (no defaults)
- [ ] Named volume `umami_db_data` declared

---

## Task T02: Analytics helper module and TypeScript declarations

### Context

All component instrumentation tasks need a typed `trackEvent` function that wraps `window.umami?.track()`. This module is the single integration point between the app code and Umami. It also provides the global TypeScript declaration so `window.umami` does not cause type errors.

### Requirements

1. Create `src/lib/analytics.ts` exporting a `trackEvent` function.
2. `trackEvent(name: string, data?: Record<string, string | number>): void` calls `window.umami?.track(name, data)`.
3. Guard against SSR: check `typeof window !== 'undefined'` before accessing `window.umami`.
4. Add a global TypeScript declaration for `window.umami` with a `track` method matching Umami's API: `track(name: string, data?: Record<string, string | number>): void`.

### Implementation Details

- File path: `/home/marlon/source/portfolio/src/lib/analytics.ts`
- The module is a plain TypeScript file with no React dependencies. It can be imported from any client component.
- The global declaration should use `declare global { interface Window { umami?: { track(name: string, data?: Record<string, string | number>): void } } }` at the top of the file, outside any function.
- The `trackEvent` function is intentionally fire-and-forget with no return value. If Umami is not loaded (script blocked by ad blocker, env var not set), the call silently does nothing via optional chaining.
- No `'use client'` directive needed since this is a utility module, not a component. The consuming client components already have that directive.

### Edge Cases and Pitfalls

- Ad blockers may block the Umami script, so `window.umami` will be `undefined`. The optional chaining (`?.`) handles this gracefully.
- Do not throw errors if tracking fails. Analytics must never break site functionality.
- SSR guard is essential because `layout.tsx` is a Server Component. Even though `trackEvent` is only called from client components, the guard makes the module safe to import anywhere.

### Test Approach

`manual-verification` -- After all tasks are complete, open browser DevTools, confirm `window.umami` exists when the script loads, and verify `trackEvent` calls appear in the Umami dashboard. Verify no console errors when Umami script is blocked.

### Acceptance Criteria

- [ ] `src/lib/analytics.ts` exists and exports `trackEvent`
- [ ] TypeScript declaration for `window.umami` compiles without errors (`pnpm tsc --noEmit`)
- [ ] `trackEvent` uses optional chaining so it never throws
- [ ] `trackEvent` has an SSR guard

---

## Task T03: Environment variable documentation

### Context

The Umami integration requires two `NEXT_PUBLIC_` environment variables to configure the script URL and website ID. These must be documented so developers and the deployment pipeline know what to set. No `.env.example` file currently exists in the project.

### Requirements

1. Create `.env.example` at the repo root.
2. Include `NEXT_PUBLIC_UMAMI_URL` with a comment explaining it points to the Umami script endpoint.
3. Include `NEXT_PUBLIC_UMAMI_WEBSITE_ID` with a comment explaining it is the UUID from the Umami dashboard.
4. Include `UMAMI_DB_PASSWORD` and `UMAMI_APP_SECRET` with comments noting they are for the server-side Docker Compose setup, not the Next.js app.

### Implementation Details

- File path: `/home/marlon/source/portfolio/.env.example`
- Use blank values (e.g., `NEXT_PUBLIC_UMAMI_URL=`) so the file is safe to commit.
- Group variables with section comments: one section for "Analytics (Next.js)" and one for "Analytics (Umami Server)".
- The `NEXT_PUBLIC_` prefix is required by Next.js to expose the variable to the browser bundle.

### Edge Cases and Pitfalls

- Do not include actual values, secrets, or localhost URLs. Leave values blank.
- This file is committed to git. Ensure no sensitive data.

### Test Approach

`manual-verification` -- Confirm the file exists, is well-formatted, and contains all four variables with clear comments.

### Acceptance Criteria

- [ ] `.env.example` exists at repo root
- [ ] Contains `NEXT_PUBLIC_UMAMI_URL` and `NEXT_PUBLIC_UMAMI_WEBSITE_ID` with explanatory comments
- [ ] Contains `UMAMI_DB_PASSWORD` and `UMAMI_APP_SECRET` with explanatory comments
- [ ] No actual secret values present

---

## Task T04: Add Umami script tag to layout

### Context

The Umami tracking script must be loaded on every page. The layout file (`src/app/[locale]/layout.tsx`) is the root layout for all routes and is the correct place to inject the script. The script should only render when the environment variables are configured, so local development without analytics works without errors.

### Requirements

1. Import `Script` from `next/script`.
2. Inside the `<head>` block (after the existing inline theme script), conditionally render a `<Script>` tag when `process.env.NEXT_PUBLIC_UMAMI_URL` and `process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID` are both set.
3. The `<Script>` tag uses `strategy="afterInteractive"`, `src` from `NEXT_PUBLIC_UMAMI_URL`, and `data-website-id` from `NEXT_PUBLIC_UMAMI_WEBSITE_ID`.

### Implementation Details

- File path: `/home/marlon/source/portfolio/src/app/[locale]/layout.tsx`
- Add `import Script from "next/script";` to the existing imports.
- Read env vars at module level: `const umamiUrl = process.env.NEXT_PUBLIC_UMAMI_URL; const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;`
- Inside the `<head>` block, after the existing `<script dangerouslySetInnerHTML>` for theme detection, add:
  ```
  {umamiUrl && umamiWebsiteId && (
    <Script
      src={umamiUrl}
      data-website-id={umamiWebsiteId}
      strategy="afterInteractive"
    />
  )}
  ```
- `strategy="afterInteractive"` ensures the tracking script loads after hydration, not blocking page render.

### Edge Cases and Pitfalls

- If either env var is empty string or undefined, the script must not render. The `&&` check handles both cases.
- `next/script` with `strategy="afterInteractive"` can be placed inside `<head>` in the App Router -- Next.js manages the actual injection point.
- Do not use `dangerouslySetInnerHTML` for this. The `next/script` component handles script loading optimally.
- The `data-website-id` attribute is a custom HTML attribute, which React/Next.js passes through to the DOM without issues.

### Test Approach

`dry-run` -- Run `pnpm build` to verify no build errors. Confirm via browser DevTools that the script tag appears in the DOM when env vars are set, and does not appear when they are unset.

### Acceptance Criteria

- [ ] `layout.tsx` imports `Script` from `next/script`
- [ ] Umami `<Script>` tag rendered conditionally based on both env vars being set
- [ ] Script uses `strategy="afterInteractive"`
- [ ] `pnpm build` succeeds
- [ ] `pnpm tsc --noEmit` passes

---

## Task T05: Instrument Hero CTA buttons

### Context

The Hero section has four theme variants (Atelier, Manifesto, Cobalt, Iris), each with two CTA buttons: "View Projects" and "Contact". All eight buttons use inline `onClick` handlers calling `go("projects")` or `go("contact")`. This task adds analytics tracking to each button click so we know which CTA drives engagement and which theme variant users see.

### Requirements

1. Import `trackEvent` from `@/lib/analytics`.
2. For each "View Projects" button (4 total, one per theme section), add a `trackEvent("hero-cta-projects", { theme: "<theme-name>" })` call.
3. For each "Contact" button (4 total, one per theme section), add a `trackEvent("hero-cta-contact", { theme: "<theme-name>" })` call.
4. Theme names in the data payload: `"atelier"`, `"manifesto"`, `"cobalt"`, `"iris"`.

### Implementation Details

- File path: `/home/marlon/source/portfolio/src/components/sections/hero.tsx`
- The existing `onClick` handlers are inline arrow functions like `onClick={() => go("projects")}`. Extend them to call `trackEvent` as well, e.g., `onClick={() => { trackEvent("hero-cta-projects", { theme: "atelier" }); go("projects"); }}`.
- There are 4 sections identified by class names: `hero-atelier`, `hero-manifesto`, `hero-cobalt`, `hero-iris`. Each has exactly two CTA buttons.
- The tracking call should happen before the `go()` call. Order does not matter functionally since `trackEvent` is fire-and-forget, but placing it first is conventional.
- Locate the 8 buttons by their surrounding section comments and class names:
  - **Atelier** (line ~91-104): two buttons in the `hero-cta` div
  - **Manifesto** (line ~202-215): two buttons in the `hero-cta` div
  - **Cobalt** (line ~321-335): two buttons in the `hero-cta` div
  - **Iris** (line ~472-491): two buttons in the `hero-cta` div

### Edge Cases and Pitfalls

- Do not change the `go()` behavior. Only add `trackEvent` calls alongside.
- The `theme` data value is hardcoded per section, not derived from the `stableTheme` variable. Each section in the JSX is for a specific theme, so the value is static.
- Ensure the curly braces for the multi-statement onClick are correct. The pattern is `onClick={() => { trackEvent(...); go(...); }}`.

### Test Approach

`manual-verification` -- Load the site, click each CTA across all four themes. Verify in Umami dashboard (or browser Network tab) that events fire with correct names and theme data.

### Acceptance Criteria

- [ ] `trackEvent` imported from `@/lib/analytics`
- [ ] All 4 "View Projects" buttons fire `hero-cta-projects` with correct `theme` value
- [ ] All 4 "Contact" buttons fire `hero-cta-contact` with correct `theme` value
- [ ] Existing scroll behavior unchanged
- [ ] `pnpm tsc --noEmit` passes

---

## Task T06: Instrument Navbar section navigation

### Context

The navbar has section buttons (about, experience, education, projects, contact) that either scroll to the section or navigate from a project detail page back to the homepage. Tracking which sections users click reveals content engagement priority.

### Requirements

1. Import `trackEvent` from `@/lib/analytics`.
2. In the `handleSectionNav` function, add `trackEvent("nav-section", { section })` before the existing navigation logic.

### Implementation Details

- File path: `/home/marlon/source/portfolio/src/components/nav/navbar.tsx`
- Add import: `import { trackEvent } from "@/lib/analytics";`
- The `handleSectionNav` function (line 38-44) currently checks `isProjectsPage` and either pushes a route or scrolls. Add the `trackEvent` call as the first line of the function body.
- This single change covers both desktop nav buttons (line 88-96) and mobile menu buttons (line 168-182) since both call `handleSectionNav`.

### Edge Cases and Pitfalls

- The `section` parameter is already a string matching the section ID. Use it directly as the data value.
- Do not add tracking to the logo/name button click (which scrolls to top or triggers hero replay). That is not a section navigation event.

### Test Approach

`manual-verification` -- Click each section link in the navbar on both desktop and mobile layouts. Verify `nav-section` events appear with the correct `section` value.

### Acceptance Criteria

- [ ] `trackEvent` imported from `@/lib/analytics`
- [ ] `handleSectionNav` fires `nav-section` event with `{ section }` data
- [ ] Both desktop and mobile nav covered by the single function change
- [ ] `pnpm tsc --noEmit` passes

---

## Task T07: Instrument Projects section

### Context

The Projects section has multiple interactive elements: expandable project cards, "View Project" links, GitHub links, and "See all projects" navigation links. Tracking these reveals which projects generate the most interest and whether users prefer detail pages or GitHub repos.

### Requirements

1. Import `trackEvent` from `@/lib/analytics`.
2. **Card expand/collapse**: In `ProjectCard`, when the card is clicked and expands (not collapses), fire `trackEvent("project-expand", { slug: project.slug })`.
3. **View Project link**: On the `<Link>` to the project detail page, add an `onClick` handler that fires `trackEvent("project-view", { slug: project.slug })` (in addition to the existing `e.stopPropagation()`).
4. **GitHub link**: On the GitHub `<a>` tag, add an `onClick` handler that fires `trackEvent("project-github", { slug: project.slug })` (in addition to the existing `e.stopPropagation()`).
5. **See all projects links**: On both "See all projects" `<Link>` elements (desktop top-right and mobile bottom center), add `onClick={() => trackEvent("see-all-projects")}`.

### Implementation Details

- File path: `/home/marlon/source/portfolio/src/components/sections/projects.tsx`
- Add import: `import { trackEvent } from "@/lib/analytics";`
- **Card expand**: The card's `onClick` toggles `expanded` via `setExpanded(!expanded)`. Change the onClick to fire the event only when expanding (going from closed to open):
  ```
  onClick={() => {
    if (!expanded) trackEvent("project-expand", { slug: project.slug });
    setExpanded(!expanded);
  }}
  ```
- **View Project link** (line ~100-106): The `onClick` already has `(e) => e.stopPropagation()`. Extend to:
  ```
  onClick={(e) => { e.stopPropagation(); trackEvent("project-view", { slug: project.slug }); }}
  ```
- **GitHub link** (line ~108-118): Same pattern, extend the existing `onClick`:
  ```
  onClick={(e) => { e.stopPropagation(); trackEvent("project-github", { slug: project.slug }); }}
  ```
- **See all projects** -- desktop link (line ~152-157): Add `onClick={() => trackEvent("see-all-projects")}`.
- **See all projects** -- mobile link (line ~167-173): Add `onClick={() => trackEvent("see-all-projects")}`.

### Edge Cases and Pitfalls

- Only track `project-expand` on expand, not on collapse. The `!expanded` check before `setExpanded` is important because at that point `expanded` is still the old value.
- The `e.stopPropagation()` on View Project and GitHub links must remain. It prevents the card's expand/collapse toggle from firing when clicking these inner links.
- The "See all projects" links use Next.js `<Link>`, which performs client-side navigation. The `onClick` fires before navigation, so the tracking call will execute. Since Umami uses `navigator.sendBeacon` under the hood, the event survives page transitions.

### Test Approach

`manual-verification` -- Expand a project card, click "View Project", click GitHub link, click "See all projects". Verify all four event types appear in the Umami dashboard with correct slugs.

### Acceptance Criteria

- [ ] `trackEvent` imported from `@/lib/analytics`
- [ ] Card expand fires `project-expand` with `{ slug }` (only on expand, not collapse)
- [ ] "View Project" link fires `project-view` with `{ slug }`
- [ ] GitHub link fires `project-github` with `{ slug }`
- [ ] Both "See all projects" links fire `see-all-projects`
- [ ] Existing `stopPropagation` behavior preserved
- [ ] `pnpm tsc --noEmit` passes

---

## Task T08: Instrument Footer social links

### Context

The Footer section contains three social/contact links: GitHub, LinkedIn, and Email. Tracking clicks reveals which contact method visitors prefer.

### Requirements

1. Import `trackEvent` from `@/lib/analytics`.
2. Add an `onClick` handler to each social link `<a>` tag that fires `trackEvent("contact-link", { platform })` where `platform` is `"github"`, `"linkedin"`, or `"email"` (lowercase).

### Implementation Details

- File path: `/home/marlon/source/portfolio/src/components/sections/footer.tsx`
- Add import: `import { trackEvent } from "@/lib/analytics";`
- The `links` array (line 30-52) already has a `label` property (`"GitHub"`, `"LinkedIn"`, `"Email"`). Use `link.label.toLowerCase()` as the platform value to avoid hardcoding a separate field.
- In the `<a>` tag (line 68), add an `onClick` handler:
  ```
  onClick={() => trackEvent("contact-link", { platform: link.label.toLowerCase() })}
  ```
- This is a single change inside the `.map()` callback, covering all three links.

### Edge Cases and Pitfalls

- The Email link uses `mailto:` which opens the email client. The `onClick` fires before the navigation, so the event will be captured.
- External links (`target="_blank"`) open in a new tab. The current page stays alive, so the tracking call completes normally.
- Do not add `e.preventDefault()`. The links must continue to work as normal.

### Test Approach

`manual-verification` -- Click each social link in the footer. Verify `contact-link` events appear with `platform` values `github`, `linkedin`, and `email`.

### Acceptance Criteria

- [ ] `trackEvent` imported from `@/lib/analytics`
- [ ] Each social link fires `contact-link` with correct `platform` value
- [ ] Links continue to navigate/open normally
- [ ] `pnpm tsc --noEmit` passes

---

## Dependency Graph

```
Group 1 (parallel):
  T01  Docker Compose reference file
  T02  Analytics helper module
  T03  Environment variable documentation

Group 2 (parallel, depends on Group 1):
  T04  Layout script tag         --> T02, T03
  T05  Hero instrumentation      --> T02
  T06  Navbar instrumentation    --> T02
  T07  Projects instrumentation  --> T02
  T08  Footer instrumentation    --> T02
```

All Group 2 tasks touch different files and can run fully in parallel.

## Complexity Estimate

**Small.** Eight files touched (3 new, 5 modified). No new dependencies, no database changes, no build configuration changes. Each component modification is a few lines adding `trackEvent` calls to existing `onClick` handlers.

## Risks and Concerns

1. **Umami script blocked by ad blockers**: Handled by design. The `trackEvent` helper uses optional chaining, so blocked scripts cause silent no-ops. No user-facing errors.
2. **`NEXT_PUBLIC_` env vars baked at build time**: These variables are inlined during `pnpm build`. The production Docker image must be built with these env vars set, or set via `next.config.ts` `env` section. The current Dockerfile does not pass build args for env vars. If the variables need to change without rebuilding, the standalone server reads `NEXT_PUBLIC_*` from the runtime environment as of Next.js 14+, but only if `output: 'standalone'` is set (which it is).
3. **No automated tests**: The project has no test infrastructure. All verification is manual. This is acceptable for analytics instrumentation where the risk of regression is low (additive changes only).
