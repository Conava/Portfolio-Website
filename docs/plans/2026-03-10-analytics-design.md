# Design: Self-Hosted Analytics (Umami)
Date: 2026-03-10

## Goals
- Track unique visitors, page views, referrers, countries, devices
- Track click events on key interactive elements
- Track time on page per session
- GDPR-compliant (EU, no consent banner required)
- Self-hosted, data ownership

## Technology: Umami
- Cookie-free → no consent banner needed, GDPR-compliant out of the box
- Clean dashboard UI
- Custom events via `window.umami.track(name, data)`
- Session duration tracked automatically

## Infrastructure

### Docker Compose additions (to server's existing compose file)
Two new services:
- `umami` — analytics app, exposed at `analytics.marlonkranz.com` via Traefik (port 3000 internal)
- `umami_db` — PostgreSQL 15, internal only (no Traefik exposure)

New env vars for `.env`:
```
UMAMI_DB_PASSWORD=<strong-password>
UMAMI_APP_SECRET=<random-64-char-string>
```

New volume: `umami_db_data`

### Reference file
`docker-compose.umami.yml` in repo root — user copies services into server compose.

## Next.js Integration

### Env vars (in `.env.local` and production env)
```
NEXT_PUBLIC_UMAMI_URL=https://analytics.marlonkranz.com/script.js
NEXT_PUBLIC_UMAMI_WEBSITE_ID=<uuid-from-umami-dashboard>
```

### Files changed
- `src/lib/analytics.ts` — typed `trackEvent()` helper wrapping `window.umami?.track()`
- `src/app/[locale]/layout.tsx` — add `<Script>` tag via `next/script` with `strategy="afterInteractive"`
- `src/components/sections/hero.tsx` — track CTA button clicks
- `src/components/nav/navbar.tsx` — track nav section clicks
- `src/components/sections/projects.tsx` — track card expand, view project, github link
- `src/components/sections/footer.tsx` — track social link clicks

## Click Events

| Event name | Trigger | Data |
|---|---|---|
| `hero-cta-projects` | Hero "View Projects" button | `{ theme }` |
| `hero-cta-contact` | Hero "Contact" button | `{ theme }` |
| `nav-section` | Navbar section button click | `{ section }` |
| `project-expand` | Project card expand | `{ slug }` |
| `project-view` | "View Project" link | `{ slug }` |
| `project-github` | GitHub link in card | `{ slug }` |
| `contact-link` | Footer social links | `{ platform: 'github'|'linkedin'|'email' }` |
| `see-all-projects` | "See all projects" links | — |

## Time on Page
Automatic via Umami session tracking — no custom events needed.
