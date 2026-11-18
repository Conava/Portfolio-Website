# Portfolio: marlonkranz.com

Personal portfolio built with Next.js 16. Bilingual (EN at `/`, DE at `/de`), four switchable designs (Ink, Trace, Flow, Type) with dark/light mode, live GitHub figures, self-hosted via Docker and Traefik.

[Live site](https://marlonkranz.com) · [LinkedIn](https://linkedin.com/in/marlon-kranz) · [Email](mailto:kontakt@marlonkranz.com)

## Stack

Next.js 16 (App Router) and TypeScript, Tailwind CSS v4, next-intl, next-themes, MDX (next-mdx-remote), Umami analytics. Bun for tooling, Node 24 at runtime, GitHub Actions to GHCR to Docker behind Traefik.

## Getting started

Requires [Bun](https://bun.sh) 1.4+, plus `git`, Node 22+ and npm for the playground build (see [Playground](#playground)).

```bash
bun install
bun dev                 # http://localhost:3000
bun run build           # production build
bun run typecheck
bun run test            # unit tests (src, scripts)
bun run test:e2e        # runs the standalone server; needs `bun run build` first
```

`dev`, `build`, `typecheck` and `test` first run `bun run playground:assets`.

### Environment variables

All optional locally.

| Variable | When | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | runtime | Live stars, releases and PR counts. Without it the site renders without those numbers. |
| `RESUME_PDF_URL` | runtime | Direct-download URL for the current resume. Without it `/resume.pdf` serves the bundled copy. |
| `DESIGN` | runtime | Default design (`keynote`, `thread`, `flow` or `type`) when the visitor has not picked one. |
| `GITHUB_GRAPHQL_URL` | runtime | Overrides the GitHub GraphQL endpoint (the e2e tests use a stub). |
| `NEXT_PUBLIC_UMAMI_URL`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | build | Enable Umami. Docker build args; the URL is the full script URL, e.g. `https://analytics.marlonkranz.com/script.js`. |
| `BPMNSCRIPT_DIR` | build, dev | Local BPMNscript checkout to build the playground from. Put it in `.env.local`. |
| `BPMNSCRIPT_REPO`, `BPMNSCRIPT_REF` | build | Override the pinned BPMNscript repo and ref. Also Docker build args. |

## Designs

| Value | Name | What it is |
|---|---|---|
| `keynote` | Ink | Paper and ink, with a WebGL ink hero and a faint ink wash behind the page. |
| `thread` | Trace | A line runs down the page and lights up the content as you scroll. |
| `flow` | Flow | A three.js scene, dark only; falls back to stills without a GPU or with reduced motion. |
| `type` | Type | Giant type; you scroll through the letters into the next section. |

Resolution order: visitor cookie, then `DESIGN`, then the default in `src/lib/site-config.ts`. Open any URL with `?design=<value>` to switch; it sets a one-year cookie and redirects, keeping other parameters such as `utm_*`. The header toggle switches between all four. Try one locally with `DESIGN=flow bun dev`.

## Languages

English lives at `/…`, German at `/de/…`. The URL alone decides; there is no language detection. The toggle links to the same page in the other language.

## Site structure

Pages live in `src/app/[locale]/`. Everything under `(site)/` (home, projects) gets the design's header and footer; `/playground` sits outside it and has its own header. Unknown URLs, including unknown project slugs, get the designed 404 from `src/app/global-not-found.tsx` with a real 404 status.

## Playground

`/playground` (German: `/de/playground`) is a BPMNscript editor with live diagram, running the BPMNscript language server and compiler in a browser web worker.

Nothing built is committed. `bun run playground:assets` builds the worker from the [BPMNscript repo](https://github.com/BPMNscript/bpmnscript) and writes it, its licenses and third-party notices, the example files and Monaco's editor worker to `public/playground/`, and the syntax grammar to `src/generated/bpmnscript/`. These paths are gitignored: don't edit or commit them.

Where the source comes from:

- `BPMNSCRIPT_DIR` set (e.g. `BPMNSCRIPT_DIR=/path/to/bpmnscript` in `.env.local`): builds that checkout with `npm run build:web`. It needs `npm install` there once.
- Otherwise: clones the repo and ref pinned in `package.json` under `"bpmnscript"` into `.cache/bpmnscript/`, and builds it. A tag is built once and reused. `BPMNSCRIPT_REPO` / `BPMNSCRIPT_REF` override the pin; change the pinned version only in `package.json`.

The worker answers LSP requests plus `bpmnscript/compile` and `bpmnscript/decompile` (types in `src/lib/playground/protocol.ts`). The `data-pg-*` attributes in `src/components/playground/` are the e2e test hooks.

### Before CI and Docker can build

CI and the Docker image fetch the pinned tag from GitHub, so they fail until it exists. The error says what to do. Steps:

1. In the BPMNscript repo, push `feat/browser-entry` and merge it (`git push -u origin feat/browser-entry`, then `gh pr create --fill`).
2. Do the release commit on `main` (version 0.2.0), then tag it: `git tag v0.2.0 && git push origin v0.2.0`. If you pick another tag, change only `"bpmnscript" → "ref"` in `package.json`.
3. Check the image: `docker build -t portfolio-test . && docker run --rm -p 3000:3000 portfolio-test`, then open `http://localhost:3000/playground`.

Don't merge this repo to `main` before step 2.

## Editing content

Everything is in `content/{en,de}/`; no application code needs to change.

| File | Content |
|---|---|
| `data/about.json` | Name, intro lines, statement, links |
| `data/work.json` | Jobs (`start`/`end` as `YYYY-MM`, `end: null` for current) |
| `data/education.json` | Schools, status, GPA |
| `data/bpmnscript.json` | BPMNscript section |
| `data/dux.json` | Dux section, featured PRs (`repo#123`), projects |
| `data/projects.json` | Other projects |
| `data/contact.json` | Email and links |
| `data/article-{bpmnscript,dux,devline}.json` | Facts for the three articles (`/bpmnscript`, `/dux`, `/devline`) |
| `articles/*.mdx` | Article prose |
| `projects/*.mdx` | Project write-ups; the file name is the URL slug |

Rules:

- Both languages carry the full facts. When you change an id, date, URL, repo, PR ref or number in one language, change it in the other too; `bun run test` fails with the JSON path of the first mismatch.
- If a German file is missing, the English one is used.
- Repos and PR refs mentioned in content are fetched from GitHub automatically.
- `panel` entries are the expandable details: `did` (a list) and an optional `significant` line.
- After a claude-devline release, edit `article-devline.json`, then run `bun scripts/devline-check.ts <path to the claude-devline checkout>`; it lists what drifted (exit 1) and what to change.
- Never type a number GitHub supplies (stars, PR counts); use the components so it renders without numbers when GitHub is unavailable.
- Company and school logos live in `public/images/logos/`; sources and usage notes are in `docs/assets.md`.

## Resume

`/resume.pdf` serves the file at `RESUME_PDF_URL` (cached for an hour, last good copy kept if the source goes down) and falls back to `content/resume.pdf`. Copy a fresh PDF over the fallback now and then.

To refresh the GitHub figures in the Typst resume source and recompile:

```bash
GITHUB_TOKEN=... bun run resume:figures path/to/resume.typ   # or rely on `gh auth login`
```

It writes `github-figures.json` next to the `.typ` file and runs `typst compile` (`--no-compile` to skip).

## Visual checks

```bash
bun run build
bun run shots -- --routes /,/projects/minj --locales en,de --label check
```

Needs the Playwright Chromium (revision 1228) in `~/.cache/ms-playwright`. It screenshots each route in every design, both color modes and desktop/mobile widths, and fails on page errors, failed same-origin requests, horizontal overflow or scroll jank. Jank means any long task or a p95 frame time over budget while scrolling; frames over 50 ms are reported too. See the header of `scripts/shots.ts` for all flags.

## Analytics

Umami events (section views with dwell time, scroll depth, outbound/resume/email clicks, design, language and color-mode switches) are sent through the typed `trackEvent` helper in `src/lib/analytics.ts`. The full event list is in `EventMap` there; `panel_open`, `panel_close` and `email_copy` are declared but not yet emitted.

## Deployment

Pushing to `main` runs typecheck and tests, builds the image (which fetches and builds BPMNscript at the pinned tag), pushes it to GHCR and restarts the container on the server over SSH. Pull requests run the checks only.

### GitHub Actions secrets

Under Settings, Secrets and variables, Actions:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | Server IP or hostname |
| `DEPLOY_USER` | SSH user |
| `DEPLOY_KEY` | Private SSH key (unencrypted) |
| `DEPLOY_PATH` | Absolute path of the directory with `docker-compose.yml` on the server |
| `NEXT_PUBLIC_UMAMI_URL` | Umami script URL, e.g. `https://analytics.marlonkranz.com/script.js` |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Website ID from the Umami dashboard |

### Server setup

One-time steps on the VPS:

1. Install Docker and Compose, and add the deploy public key to `~/.ssh/authorized_keys`.
2. Add the service to the server's `docker-compose.yml`:

   ```yaml
   portfolio:
     image: ghcr.io/conava/portfolio-website:latest
     restart: unless-stopped
     environment:
       GITHUB_TOKEN: ${PORTFOLIO_GITHUB_TOKEN}
       RESUME_PDF_URL: ${PORTFOLIO_RESUME_PDF_URL}
       # DESIGN: keynote
     labels:
       - "traefik.enable=true"
       - "traefik.http.routers.portfolio.rule=Host(`marlonkranz.com`)"
       - "traefik.http.routers.portfolio.entrypoints=websecure"
       - "traefik.http.routers.portfolio.tls.certresolver=letsencrypt"
       - "traefik.http.services.portfolio.loadbalancer.server.port=3000"
     networks:
       - traefik
   ```

3. **GitHub token.** Create a fine-grained personal access token (GitHub, Settings, Developer settings): resource owner = your account, access to public repositories only, no extra permissions. Put it in the server's `.env` as `PORTFOLIO_GITHUB_TOKEN`. The GraphQL search API requires a token even for public data. If the Dux org repos are not visible with it, select that organization as resource owner (it may need to approve the token).
4. **Resume URL.** In Nextcloud, create a public share link of the resume PDF (no password, no expiry). Append `/download` to the link, giving `https://<nextcloud-host>/s/<token>/download`, and put that in `.env` as `PORTFOLIO_RESUME_PDF_URL`. Check with `curl -sIL <url>`: it should return `200` and `application/pdf`. When the file changes in Nextcloud, the site picks it up within an hour.
5. **Umami version.** The Sessions view and the Journey report need a recent Umami release. Check the version in the Umami footer or under Settings; if it is old, back up the PostgreSQL database, bump the image tag in the Umami compose file, then `docker compose pull umami && docker compose up -d umami`.
6. Apply the env changes: `docker compose up -d portfolio`.
