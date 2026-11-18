# Logo assets

Logos have no plate. Each has a full-colour file for light grounds and a `<name>-dark.svg` for dark grounds (see the table below), switched by CSS from the ground it sits on. Neither is recolored with filters or opacity. All files are SVG from Wikimedia Commons, fetched 2026-11-09. Each was sanitized (XML prolog, DOCTYPE, comments, editor metadata, `<style>` blocks and unused namespaces removed; class fills inlined) without touching paths or colors. Every file is flagged on Commons as public domain plus a "trademarked" restriction: the artwork is free to copy, but the marks remain trademarks of their owners and are shown only to identify the author's own school or employer, unaltered.

Source pages are `https://commons.wikimedia.org/wiki/File:<name>`.

| File | Source (Commons file) | Trademark owner | Clear space | Intrinsic size (viewBox) | Display height |
|---|---|---|---|---|---|
| `public/images/logos/gatech.svg` | `Georgia_Tech_logo_2021.svg` (official institute wordmark, Tech Gold only; the navy variant is not on Commons) | Georgia Tech | Height of the "G" on all sides; keep the box padding | 720x162 | Fitted into 208x64 in a 240x104 box with 32 px right padding (education) |
| `public/images/logos/uhh.svg` | `UHH_Universität_Hamburg_Logo_mit_Schrift_2010_Farbe_CMYK.svg` (2010 logo with tagline, red + black) | Universität Hamburg | Width of the red square's inner "U" on all sides; keep the box padding | 392x127 | Fitted into 208x64 in a 240x104 box with 32 px right padding (education) |
| `public/images/logos/sdsu.svg` | `San_Diego_State_University_primary_logo.svg` (primary horizontal logo, red) | San Diego State University | Height of the "SDSU" lettering on all sides; keep the box padding | 254x42 | Fitted into 208x64 in a 240x104 box with 32 px right padding (education) |
| `public/images/logos/adobe.svg` | `Adobe_Corporate_wordmark.svg` (current corporate wordmark, Adobe Red) | Adobe Inc. | Height of the "A" on all sides | 66.25x16.75 | 24-32 px |
| `public/images/logos/otto.svg` | `Otto_logo_neu.svg` (OTTO red italic wordmark, as on otto.de) | OTTO (GmbH & Co KG) | Height of one "T" on all sides | 100x37 | 24-32 px |
| `public/images/logos/msg-life.svg` | `Msg-life-logo.svg` (msg life, grey wordmark with red dot) | msg systems / msg life ag | Height of the red dot x2 on all sides | 493.4x157.7 | 24-32 px |

Dark-ground variants (made 2026-11-18 by changing only fill colors of the files above; paths untouched). Each logo has up to three files: `<name>.svg` (light grounds), `<name>-dark.svg` (dark grounds; keeps the brand colour where a guide allows or is silent) and `<name>-white.svg` (one-colour white, shown only on Type's rust "alt" ground, where red would vanish: Adobe red is about 1.2:1 there).

| Brand | `-dark` | `-white` | Basis |
|---|---|---|---|
| Universität Hamburg | "Invertiert": red square kept, wordmark and tagline white | "Vollinvertiert": white square | Corporate Design Manual (2026) p. 6, "Farbiger Hintergrund" (https://www.fid.uni-hamburg.de/corporate-manual.pdf): transparent logo allowed on monochrome backgrounds, variants Invertiert and Vollinvertiert shown; no other recoloring. Full logo only. |
| Adobe | Red (`#eb1000`, unchanged); about 5:1 on Ink and Trace dark | White | https://www.adobe.com/legal/permissions/trademarks.html names no background rule and Adobe's brand resources are not reachable. The red wordmark is used unaltered on dark. Unverified. |
| OTTO | Red (`#DA251D`, unchanged); about 4.3:1 on Ink and Trace dark | White | No public OTTO brand guide found (the press page is gone). Unaltered red used. Unverified. |
| Georgia Tech | Tech Gold (`#aa985d`, as in the light file); 6.7:1 on Ink and Trace dark, 6.0:1 on Type dark. Deliberate deviation: the guide prefers white on dark (https://brand.gatech.edu/our-look/logos) and approves only Tech Gold + White on Navy; the owner chose to keep the brand colour (2026-11-18). | White | Fills only; shapes untouched. |
| SDSU | "SDSU" in red (`#d41736`), "San Diego State University" white; red is 3.6:1 on Ink and Trace dark, 3.2:1 on Type dark. Deliberate deviation: the guide prefers the reverse (white) logo on dark (https://brand.sdsu.edu/identity/logos/primary-logo) and says logos cannot be modified; the owner chose to keep the brand colour (2026-11-18). | White | Fills only; shapes untouched. |
| msg life | White wordmark, red dot kept | White | No public guide found. Unverified. |

Notes:
- The tiny "life" under "msg" is about 3 px tall at 24 px display height; use 32 px if it must be legible.
- Georgia Tech's own brand site gates its downloads behind a login, so the Commons copy of the 2021 logo is used. None of the Commons files has a baked-in background rectangle: the white shapes inside the Universität Hamburg square are part of the emblem.
- The Commons SVGs are not official brand-kit downloads; swap in the owner's file if exact artwork matters.
- The schools are shown as full logos (mark plus wordmark), never the emblem alone, in boxes of one size. Checked 2026-11-11:
  - Universität Hamburg, Corporate Design Manual (2026, https://www.fid.uni-hamburg.de/corporate-manual.pdf): "Insbesondere darf die Bildmarke (rotes Quadrat) nicht ohne die Wortmarke verwendet werden"; the logo must not be cropped, distorted, rotated or recolored, and neighbouring elements must not "visually comment" on it.
  - Georgia Tech, https://brand.gatech.edu/our-look/logos: "Do not use the Interlocking GT alone for academic or organizational usage"; the Seal alone is restricted to listed units. Tech Gold on white is an approved combination.
  - SDSU, https://brand.sdsu.edu/identity/logos and /monogram: the solid "SDSU" monogram may stand in for the primary logo, but logos "cannot be modified". The monogram alone is allowed; the full logo is used anyway so all three match.

### Employer wordmarks in the Flow design

Flow shows the employers' wordmarks without a plate, on its dark ground, as the heading of each job (`alt` is the company name), using the same `-dark.svg` versions as the other designs on dark grounds: no recolour, no crop, no outline; clear space is kept as a margin (Adobe and OTTO one mark height above and below, msg life 0.45 of it). Adobe Red and OTTO red stay above 3:1 on the dark ground; msg life's grey lettering is about 3.8:1 (its red dot is lower and decorative). The brand guides of OTTO and msg were not checked for a rule on dark grounds; swap in an owner's negative (white) version if one is published.

Universität Hamburg (the teaching assistant job) keeps its plain name in type: its logo's lettering is black, the manual forbids recolouring it and forbids the red square without the wordmark, so no version works on a dark ground without a plate.

## GitHub mark

`GithubMark` in `src/components/shared/icons.tsx` is GitHub's Invertocat, the path copied unaltered from `primer/octicons` `icons/mark-github-16.svg` (MIT, fetched 2026-11-11). It follows the logo guidelines at https://github.com/logos: the Invertocat is used as a button to link to a GitHub profile or project, it is not modified, stretched or combined with other artwork, and it is monochrome. It takes the button's text color (near-black on light grounds, near-white on dark ones). It always sits next to a visible text label and is never used as this site's own logo. GITHUB and the Invertocat are trademarks of GitHub, Inc.

# Screenshots

All fetched 2026-11-09, converted to WebP (max 1600 px wide, quality 82, metadata stripped). Every image is a screenshot made by the site owner, so no third-party credit applies (`credit` is unset). Images from the duxlabs.dev website and docs were not used: their reuse terms are not stated, so they stay out.

Licenses: `duxlabs-dev/dux-shell` is MIT (the PR screenshots are the owner's own contributions); `Conava/dux-player` and `Conava/dux-plugins` are MIT (the owner's own repositories).

| File | Source | Used in | Credit |
|---|---|---|---|
| `public/images/cast/overview.webp` | Conava/dux-plugins, Cast/screenshots/overview.png | Cast gallery | none |
| `public/images/cast/player.webp` | Conava/dux-plugins, Cast/screenshots/player.png | Cast gallery | none |
| `public/images/cast/devices.webp` | Conava/dux-plugins, Cast/screenshots/devices.png | Cast gallery | none |
| `public/images/cast/playing.webp` | Conava/dux-plugins, Cast/screenshots/playing.png | Cast gallery | none |
| `public/images/cast/searching.webp` | Conava/dux-plugins, Cast/screenshots/searching.png | Cast gallery | none |

# Article assets (Phase 4)

Added 2026-11-11. Everything here is the site owner's own work, so no third-party credit applies. Images are WebP (max 1600 px wide, quality 82, metadata stripped) unless noted.

## Thesis

| File | Source | Date | Terms | Credit |
|---|---|---|---|---|
| `public/thesis.pdf` | Bachelor thesis "A Domain-Specific Language for Business Process Model and Notation" (Universität Hamburg, submitted 2026-10-27). Public build from the final source, which has small typo fixes since submission: title page without the Matrikelnummer, no signature page (162 pages) | 2026-10-27 | Own work, published by the author | none |

## Thesis figures and talk figures

SVGs are the thesis figures with the XML prolog, DOCTYPE and generator comment removed; the drawing is untouched. They are shown on the light plate in both modes.

| File | Source | Intrinsic size | Credit |
|---|---|---|---|
| `public/images/bpmnscript/expense-claim.svg` | Thesis figure, rendered with bpmn-js | 1546x230 | none |
| `public/images/bpmnscript/editor-completion-target.webp` | Thesis figure, same | 1113x117 | none |
| `public/images/bpmnscript/editor-diagnostic.webp` | Thesis figure, same | 970x146 | none |
| `public/images/bpmnscript/editor-hover.webp` | Thesis figure, same | 937x97 | none |
| `public/images/bpmnscript/editor-missing-binding.webp` | Defense talk figure `editor-fehlende-bindung-crop.png`: the full invoice source with the missing-binding diagnostic on a service task (the thesis figures show other diagnostics) | 1600x398 | none |
| `public/images/bpmnscript/running-instance.webp` | Defense talk figure `tasklist-review-invoice.png`: the invoice process with its active task highlighted (the thesis figures show no running instance) | 1600x498 | none |

## Dux screenshots

Same terms as above: `duxlabs-dev/dux-shell` and `duxlabs-dev/dux-gop` are MIT (the PR screenshots are the owner's own contributions), `Conava/dux-player` is MIT. Re-picked 2026-11-17 from all of the owner's PR bodies: screenshots that show a user name, a host name or a home path were dropped or have that text blurred; the rest are unaltered. Dux Player images are the README screenshots of 2026-11-07, the newest the repository has.

| File | Source | Used in | Credit |
|---|---|---|---|
| `public/images/dux-shell/network-overview.webp` | PR duxlabs-dev/dux-shell#3727 (screenshot attached to the PR) | /dux, Network connections | none |
| `public/images/dux-shell/network-editor-connections.webp` | PR duxlabs-dev/dux-shell#3727 (screenshot attached to the PR) | /dux, Network connections; source of the /dux Open Graph image | none |
| `public/images/dux-shell/network-editor-wifi.webp` | PR duxlabs-dev/dux-shell#3727 (screenshot attached to the PR) | /dux, Network connections | none |
| `public/images/dux-shell/connections-hotspot.webp` | PR duxlabs-dev/dux-shell#3727 (screenshot attached to the PR) | /dux, Network connections | none |
| `public/images/dux-shell/pr3768-2.webp` | PR duxlabs-dev/dux-shell#3768 (screenshot attached to the PR) | /dux, System monitor | none |
| `public/images/dux-shell/pr3768-7.webp` | PR duxlabs-dev/dux-shell#3768 (screenshot attached to the PR) | /dux, System monitor | none |
| `public/images/dux-shell/pr3768-10.webp` | PR duxlabs-dev/dux-shell#3768 (screenshot attached to the PR) | /dux, System monitor | none |
| `public/images/dux-shell/pr3768-11.webp` | PR duxlabs-dev/dux-shell#3768 (screenshot attached to the PR) | /dux, System monitor | none |
| `public/images/dux-shell/pr3768-12.webp` | PR duxlabs-dev/dux-shell#3768 (screenshot attached to the PR) | /dux, System monitor | none |
| `public/images/dux-shell/pr4137-1.webp` | PR duxlabs-dev/dux-shell#4137 (screenshot attached to the PR, fetched 2026-11-17, user name blurred) | /dux, System monitor | none |
| `public/images/dux-shell/pr4219-2.webp` | PR duxlabs-dev/dux-shell#4219 (screenshot attached to the PR, fetched 2026-11-17) | /dux, System monitor | none |
| `public/images/dux-shell/pr3867-1.webp` | PR duxlabs-dev/dux-shell#3867 (screenshot attached to the PR) | Homepage Dux section lead image; /dux, Config profiles | none |
| `public/images/dux-shell/pr3867-5.webp` | PR duxlabs-dev/dux-shell#3867 (screenshot attached to the PR) | /dux, Config profiles | none |
| `public/images/dux-shell/pr3867-6.webp` | PR duxlabs-dev/dux-shell#3867 (screenshot attached to the PR) | /dux, Config profiles | none |
| `public/images/dux-shell/pr3867-8.webp` | PR duxlabs-dev/dux-shell#3867 (screenshot attached to the PR) | /dux, Config profiles | none |
| `public/images/dux-shell/pr4155-2.webp` | PR duxlabs-dev/dux-shell#4155 (screenshot attached to the PR) | /dux, Wallpapers | none |
| `public/images/dux-shell/pr4155-4.webp` | PR duxlabs-dev/dux-shell#4155 (screenshot attached to the PR) | /dux, Wallpapers | none |
| `public/images/dux-shell/pr4130-2.webp` | PR duxlabs-dev/dux-shell#4130 (screenshot attached to the PR) | /dux, Wallpapers | none |
| `public/images/dux-shell/pr4129-1.webp` | PR duxlabs-dev/dux-shell#4129 (screenshot attached to the PR, user and host name blurred) | /dux, Connected popouts | none |
| `public/images/dux-shell/pr4129-3.webp` | PR duxlabs-dev/dux-shell#4129 (screenshot attached to the PR, user and host name blurred) | /dux, Connected popouts | none |
| `public/images/dux-shell/pr3020-1.webp` | PR duxlabs-dev/dux-shell#3020 (screenshot attached to the PR, user name, host name and home path blurred) | /dux, Theming | none |
| `public/images/dux-shell/pr3020-2.webp` | PR duxlabs-dev/dux-shell#3020 (screenshot attached to the PR, user name, host name and home path blurred) | /dux, Theming | none |
| `public/images/dux-shell/pr3662-1.webp` | PR duxlabs-dev/dux-shell#3662 (screenshot attached to the PR) | /dux, Theming | none |
| `public/images/dux-player/home.webp` | Conava/dux-player, docs/screenshots/home.png | Homepage Dux Player scene | none |
| `public/images/dux-player/now-playing.webp` | Conava/dux-player, docs/screenshots/now-playing.png | Homepage Dux Player scene | none |
| `public/images/dux-player/lyrics.webp` | Conava/dux-player, docs/screenshots/lyrics.png | Homepage Dux Player scene | none |
| `public/images/dux-player/bars.webp` | Conava/dux-player, docs/screenshots/bars.png | /dux, Dux Player figure | none |

## Open Graph images

1200x630 JPEG, cropped from real images with sharp or taken as screenshots of the site; nothing is added or drawn.

| File | Source | Credit |
|---|---|---|
| `public/images/og/home.jpg` | Screenshot of `/`, Ink design, light mode, 1200x630 viewport (2026-11-17) | none |
| `public/images/og/bpmnscript.jpg` | The thesis invoice-approval figure (bpmn-js render) on the light plate color (#f4f4f1) | none |
| `public/images/og/dux.jpg` | `public/images/dux-shell/network-editor-connections.webp` (PR #3727), cover crop from the top | none |
| `public/images/og/playground.jpg` | Screenshot of `/playground`, Ink design, light mode, 1200x630 viewport | none |
| `public/images/og/devline.jpg` | Screenshot of the rendered `/devline` pipeline figure (Ink, light), placed on the page's paper color (rgb 240,241,236) | none |

## Project covers

| File | Source | Credit |
|---|---|---|
| `public/images/projects/portfolio/cover.jpg` | Screenshot of `/`, Ink design, light mode, 1600x900 viewport at 1.2x (1920x1080), 2026-11-17 | none |

## Ink background blooms

Generated, not sourced: `scripts/ink-bg-prerender.ts` renders SVG turbulence filters in the cached Chromium and saves them as WebP (white with alpha; `src/components/ink/ink-bg.css` colours them). They are the static fallback of the ambient ink (reduced motion, no WebGL2). Rerun the script to regenerate them.

| File | Source | Used in | Credit |
|---|---|---|---|
| `public/images/ink/bg/bloom-1.webp` | `scripts/ink-bg-prerender.ts` (480x480, seed 3) | Ink homepage: About, BPMNscript intro, Projects (static fallback) | none |
| `public/images/ink/bg/bloom-2.webp` | `scripts/ink-bg-prerender.ts` (480x480, seed 11) | Ink homepage: Work, BPMNscript proof, Dux (static fallback) | none |
| `public/images/ink/bg/bloom-3.webp` | `scripts/ink-bg-prerender.ts` (480x480, seed 21) | Ink homepage: About, Education, Projects (static fallback) | none |

## Geist Mono

`src/fonts/geist-mono/GeistMono-{Regular,Medium}.woff2` are copied unaltered from the `geist` npm package 1.9.2 (Vercel and basement.studio), SIL Open Font License 1.1 (`OFL.txt` beside them). Each file covers latin and latin-ext. They load through `next/font/local` instead of `next/font/google` because Google sometimes serves a `&skey=` font URL that fails the Turbopack build.
