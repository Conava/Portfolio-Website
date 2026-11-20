# CLAUDE.md

Non-obvious context for working in this repo. Read the code for the rest.

## Commands

Bun is the toolchain (install, scripts, tests); Node 24 is the runtime (`next build`, `next start`, Docker).

```bash
bun install --frozen-lockfile
bun dev                  # dev server
bun run build            # production build
bun run typecheck        # next typegen && tsc --noEmit
bun run test             # unit tests (src, scripts)
bun run test:e2e         # HTTP end-to-end tests against `node .next/standalone/server.js`; needs a prior `bun run build`
bun run shots            # visual harness (below)
bun run resume:figures <resume.typ>   # see Resume
bun run playground:assets             # see Playground; dev, build, typecheck and test run it first
bun scripts/devline-check.ts <claude-devline checkout>   # /devline article vs that repo; exit 1 = drift, lists what to edit in article-devline.json
```

CI (`.github/workflows/deploy.yml`) runs typecheck + `bun run test` on every push and PR (with Node 24 for the BPMNscript build); deploy only on `main`. Do not add `package-lock.json`, `pnpm-lock.yaml` or `yarn.lock`.

## Architecture

Next.js 16 App Router, routes under `src/app/[locale]/`. Each design has its own home (`src/components/{ink,trace,flow,type}/`); shared pieces (panels, viz, GitHub blocks, controls) live in `src/components/shared/`, article components in `src/components/article/`. `HomeContent` + `GithubData | null` + `Design` is the data contract any design component consumes. Presentation never holds facts.

Layout:

- `src/app/site-shell.tsx` (`SiteShell`) is the document: `<html data-design>`, providers, Umami, analytics listeners. `[locale]/layout.tsx` and `global-not-found.tsx` both render it.
- `src/app/site-chrome.tsx` (`SiteChrome`) is the skip link plus the design's header and footer. Only `[locale]/(site)/layout.tsx` uses it, so pages under `(site)` (home, projects, later articles) get the chrome and `/playground` (outside `(site)`) does not.
- 404s: `experimental.globalNotFound` in `next.config.ts`; `src/app/global-not-found.tsx` renders the designed 404 (`(site)/not-found.tsx`) inside shell and chrome, as a real server-rendered 404. A `notFound()` inside `[locale]` only reaches the browser as Next's client error shell, so unknown URLs are routed to "no match" instead: the proxy rewrites unknown project slugs to an unmatched path, and a `next.config.ts` rewrite moves any first segment that is not `en`/`de`/`_next`/`api` under `/en/`. Removed project pages (`/projects/devline`, `/projects/bachelor-thesis`) are not redirected; they 404 as unknown slugs.
- `turbopack: { root: __dirname }` in `next.config.ts` is required: an outer lockfile otherwise makes Turbopack pick the wrong root and fail to resolve `next/font` files. `turbopack.rules` loads `@codingame` CSS as raw text because the Monaco VS Code API does `import * as x from "./x.css"`, which Turbopack 16.4 rejects. `src/lib/resume.ts` marks its `readFile` path with `/*turbopackIgnore: true*/` so the bundler does not trace `content/`.

Without JS the page renders light (next-themes needs JS to apply the dark class); that is accepted.

### Design selection

Four designs in `src/lib/design-values.ts` (client-safe; `design.ts` imports `next/headers`): `keynote` "Ink", `thread` "Trace", `flow` "Flow", `type` "Type". Resolved server-side per request: valid cookie `design` > valid env `DESIGN` > `siteConfig.design`. The layout reads the cookie, so `<html data-design>` is right in the first byte (no flash, no client script) and every route renders dynamically. Invalid values are ignored. The header toggle offers all four.

`?design=thread` on any URL: `src/proxy.ts` sets the cookie (1 year, Lax) and 307-redirects with only `design` removed; path (including `/de`) and other params (`utm_*`) are kept. An invalid value is stripped without setting a cookie. Dark/light mode is separate (`next-themes`, class on `<html>`); Flow forces dark (`forcedTheme`).

Each design has its own token file; an `--s-*` alias layer lets shared components (panels, viz, article, GitHub blocks) style themselves per design.

- **Ink**: paper and ink, WebGL fluid hero (`fluid.ts`). `InkAmbient` (`ink-bg.tsx`) is a quarter-resolution, 30 fps ink wash behind the page with a static CSS fallback; its colours are tuned for text contrast, so re-check contrast when changing them.
- **Trace**: a line runs down the page and "executes" the content, scroll-driven (`trace-layer-client.tsx`). While a scene is pinned the lit tip runs from the 40 % line to `PIN_END` (0.85); `sections/education.css` repeats that number, so change both.
- **Flow**: three.js scene, dark only, imported lazily (`flow-canvas.tsx` does `import("./scene")`). With no GPU, with reduced motion or when frames are slow, `data-live` is `off`/`still` and the page shows stills; text never depends on the canvas.
- **Type**: giant type; each section's facade word sits on a sticky stage and you fly through a counter of one of its letters into the next section (`stage.tsx`; native scroll, nothing runs while no facade is on screen). Headings stay exposed to assistive tech.

### i18n

English at `/…`, German at `/de/…` (next-intl, `localePrefix: "as-needed"`). The URL alone decides the language: no cookie, no `Accept-Language` detection, no `?lang=`. `/en/x` redirects to `/x`. The language toggle links to the same page in the other locale, keeping query and hash. Exception: `/playground` is English only; `/de/playground` 308-redirects to it, the sitemap lists it once, and `isPageHref` treats it as a plain link.

Internal links to pages go through `Link` / `getPathname` from `src/i18n/navigation.ts`. Files (`/resume.pdf`, `/images/...`) stay plain unprefixed URLs: the proxy matcher skips paths with a dot (except under `/de/` and `/projects/`, where no files live), so `/de/resume.pdf` is a 404.

UI strings: `messages/{locale}.json`. Content: below.

### Content

- `content/{locale}/data/{about,work,education,bpmnscript,dux,projects,contact}.json`, typed in `src/lib/types.ts`, loaded by `getHomeContent()` in `src/lib/content.ts`.
- `content/{locale}/projects/*.mdx` project write-ups (frontmatter: `ProjectFrontmatter`). Slugs come from the EN filenames.
- Panels (`Panel` in `types.ts`) are `did: string[]` plus an optional `significant` line (why it mattered) and an optional `viz`. There is no "learned" field.
- Articles `/bpmnscript`, `/dux`, `/devline`: facts in `content/{locale}/data/article-<slug>.json`, prose in `content/{locale}/articles/<slug>.mdx`, rendered by `mdx-article.tsx` with `Section`, `Figure`, `Num`, `Pct` and per-article slot components (`src/components/article/<slug>/`). `meta.sections[].id` must match the MDX sections. Never write a count GitHub supplies; use `Num`/`Pct` or the PR list so it disappears when GitHub data is `null`. After a claude-devline release, edit `article-devline.json` and run `devline-check`. Articles are published only with the runtime env `ARTICLES=on` (`articlesLive()` in `site-config.ts`); without it each article route renders "Coming soon" (noindex) and the sitemap leaves them out, while homepage links still point there. The e2e helper turns it on by default.
- Both locales carry the full facts. A missing DE file falls back to EN at file level. `src/lib/content.test.ts` checks that fact fields (ids, dates, URLs, repos, refs, numbers, status) match between EN and DE and reports the JSON path of the first mismatch. Change a fact in both files or the test fails.
- Dates are `YYYY-MM`; `end: null` means current.
- Every repo and featured PR ref mentioned in content is picked up automatically for the GitHub query (`contentGithubRefs`). Featured PR refs are `repo#123` (owner defaults to the Dux org) or `owner/repo#123`.
- Logo files and their licensing: `docs/assets.md`. Logos have no plate: the colour file on light grounds, its `-dark.svg` (the brand's own one-colour/negative) on dark ones, picked by CSS from the ground (`LogoPlate`, `media.css`). Add both files for a new logo.

### GitHub data

`src/lib/github.ts`: one GraphQL request (endpoint overridable with `GITHUB_GRAPHQL_URL`, which the e2e tests point at a stub) (repo stars/releases, featured PR state, org PR totals) cached 1 h via `unstable_cache`. The cached function throws on error so Next keeps serving the last good entry; the wrapper `getGithubData` returns `null` on any failure or when `GITHUB_TOKEN` is unset. Pages call `getSiteGithub(locale, home?)` (`site-github.ts`); `lookupPr(github, ref, defaultOwner)` finds a PR in the result, including org PRs that are not featured. Consumers must render without numbers when `null`; never invent figures. Everything except `getGithubData` has no Next imports so Bun scripts reuse it.

`GITHUB_TOKEN` is a runtime env var, never a build arg.

### Resume

`/resume.pdf` is a route handler (`src/app/resume.pdf/route.ts`, logic in `src/lib/resume.ts`). With `RESUME_PDF_URL` set (a Nextcloud public-share direct-download URL) it serves that file, cached 1 h in memory, keeps the last good copy, and backs off 5 min after a failure. Without it, or on failure with no cached copy, it serves the bundled `content/resume.pdf`. The fallback lives in `content/`, not `public/`, because a static `public/resume.pdf` would shadow the route. Refresh the fallback occasionally by copying the current PDF over it.

The resume's GitHub numbers are refreshed by hand: `bun run resume:figures <path/to/resume.typ>` fetches live figures, writes `github-figures.json` beside the `.typ`, and runs `typst compile` (`--no-compile` to skip). Token from `GITHUB_TOKEN` or `gh auth token`. On failure it leaves the file untouched.

### Analytics

Self-hosted Umami. The script tag in `src/app/site-shell.tsx` renders only when `NEXT_PUBLIC_UMAMI_WEBSITE_ID` is set and `NEXT_PUBLIC_UMAMI_URL` starts with `https://analytics.marlonkranz.com`. The URL is used verbatim as the script `src`, so it must be the full script URL, e.g. `https://analytics.marlonkranz.com/script.js`. Both are build args (baked into the client bundle).

Use `trackEvent(name, data)` from `src/lib/analytics.ts`; it is typed by `EventMap`, so add new events there first. It no-ops on the server and without Umami. Events:

| Event | Properties | Source |
|---|---|---|
| `section_view` | `section`, `dwell` bucket (`1-5s`, `5-15s`, `15-60s`, `60s+`) | `TrackedSection`, IntersectionObserver on a line through the viewport middle; under 1 s is not sent |
| `scroll_depth` | `depth` 25/50/75/100 | `AnalyticsListeners`; also serves as article read progress |
| `outbound_click` | `host`, `url`, `label`, `section` | delegated click listener |
| `resume_download`, `email_click` | `section` | delegated click listener (`/resume.pdf`, `mailto:`) |
| `design_toggle` | `from`, `to`, `via` | design switch |
| `locale_switch` | `from`, `to` | language switch |
| `color_mode` | `to` | dark/light switch |
| `email_copy` | `section` | copy-email button |
| `panel_open`, `panel_close` | `panel`, `section` | detail panels |
| `playground_preset` | `preset` | the playground |
| `playground_import` | `result` (`ok`/`warning`/`refused`), `source` (`file`/`drop`/`preset`), `preset?` | the playground |
| `playground_compile_error` | `errors` | the playground |
| `playground_export` | `format` (`bpmn`/`bpmnscript`) | the playground |
| `playground_share` | none | the playground |

One capture-phase click listener covers all links; `section` is the closest `section[id]` (or `header` / `footer`), which gives journeys context. Add `id` to new sections; article sections are tracked as `section_view` too.

### Playground

`/playground` runs the BPMNscript language server and compiler in a browser web worker. Nothing built is committed: `bun run playground:assets` (`scripts/playground-assets.ts`) builds `@bpmn-script/web` from the BPMNscript repo and writes:

- `public/playground/bpmnscript/`: `server-worker.js`, `monarch.js`, `language-configuration.json`, the licenses and `THIRD_PARTY_NOTICES.txt` (served next to the worker on purpose)
- `public/playground/presets/<id>.<bpmnscript|bpmn>`: the files listed in `src/lib/playground/presets.ts`
- `public/playground/editor.worker.js`: Monaco's editor worker, bundled with `Bun.build`
- `src/generated/bpmnscript/`: `monarch.js` (+ `.d.ts`), `language-configuration.json` (`wordPattern` is a regex source string), `meta.json` (version, ref, commit, local/git, dirty)

All of these are gitignored and dockerignored: never edit or commit them. Asset URLs are absolute and unprefixed.

Source: `BPMNSCRIPT_DIR` (a local checkout, e.g. set in `.env.local`) runs `npm run build:web` there. Otherwise it shallow-clones `package.json` → `bpmnscript.repo` at `bpmnscript.ref` into `.cache/bpmnscript/` and builds with `npm ci`; `BPMNSCRIPT_REPO` / `BPMNSCRIPT_REF` override them. The pinned ref lives only in `package.json`. A tag or SHA build is cached (warm run is a no-op); a branch is rebuilt each run. Needs `git`, Node 22+ and `npm`. If the ref can't be fetched it exits 1 and names the fix.

Wire contract: the worker is an ES module worker speaking LSP JSON-RPC over `postMessage`, plus `bpmnscript/compile` (`{ source }`) and `bpmnscript/decompile` (`{ xml }`), which always answer with a result, never a JSON-RPC error. Types in `src/lib/playground/protocol.ts`; `src/lib/playground/worker.test.ts` drives the real worker.

e2e (`e2e/helpers.ts`) lays out `.next/standalone` like the Dockerfile (copies `public`, `.next/static`, `content` once per `BUILD_ID`) and starts it with `HOSTNAME=::`: `127.0.0.1` makes the server loop. Use the helper, not `next start`.

The page is a small IDE: an explorer of `.bpmnscript` files, tabs, the Problems panel and a status bar. Files live in `localStorage` (`pg-workspace-v1`, logic in `src/lib/playground/workspace.ts`); each file has its own Monaco model (URI from a stable id), so switching keeps undo. Presets, imports and share links open as files; export and share use the open file. It has its own theme (the site design does not apply), only light/dark.

Test hooks are the `data-playground` / `data-pg-*` attributes in `src/components/playground/`; e2e relies on their names.

### Visual harness

`bun run shots` drives `playwright-core` (pinned to 1.61.1, which expects the Chromium revision cached under `~/.cache/ms-playwright`) against a production build, takes screenshots and reports page errors, same-origin 4xx/5xx, horizontal overflow and scroll jank. It starts `next start -p 3100` itself unless `--url` is given, so run `bun run build` first. Jank: it records frame times while scrolling; frames over 50 ms are counted and reported, long tasks and long animation frames are observed, and the gate fails on any long task or a p95 frame time over budget (`scripts/lib/frame-stats.ts`; SwiftShader timings are indicative only). `--frames-mode scroll|action` captures frame sequences. Exit 1 on any finding (`--no-fail` to override). Flags: `--routes`, `--designs`, `--modes`, `--widths`, `--locales` (selects the URL prefix), `--label`, `--out`, `--frames`, `--no-jank`. The default output directory is gitignored; override with `--out`.

### SEO

`src/lib/seo.ts` builds per-page metadata: `alternatesFor` (self-referencing canonical; `en`, `de` and `x-default` hreflang), `ogLocale`, `socialFor` (a page's `openGraph`/`twitter` replace the layout's wholesale, so every page sets the full set). `src/app/sitemap.ts` lists each path per locale with `xhtml:link` alternates (English as `x-default`) and real modified dates. JSON-LD per page: `Person` on home, `TechArticle` on articles, plus `SoftwareSourceCode` and `Thesis` where they apply.

### Fonts

`src/lib/fonts.ts`; each design preloads only its display face. Geist Mono is vendored (`src/fonts/geist-mono/`, OFL, see `docs/assets.md`) and loaded with `next/font/local`: Google sometimes serves it from an `&skey=` URL that Turbopack's `next/font/google` lookup rejects, which failed about 1 in 4 cold builds. Keep it local.

### Other

- `siteConfig` (`src/lib/site-config.ts`): name, URL, job title, links, default design, GitHub login and Dux org.
- SEO: `src/app/sitemap.ts`, `src/app/robots.ts`, JSON-LD on the home page, per-project metadata in `generateMetadata`.
- Docker: all stages `node:24-alpine`; the Bun binary is copied in for install and build. The builder adds `git` for the BPMNscript clone and takes `BPMNSCRIPT_REPO` / `BPMNSCRIPT_REF` build args.
