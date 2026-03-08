# Portfolio — marlonkranz.com

Personal portfolio website built with Next.js 16, featuring bilingual content (EN/DE), four switchable design themes each with dark/light variants, and a fully automated Docker-based CI/CD pipeline.

[Live Site](https://marlonkranz.com) · [LinkedIn](https://linkedin.com/in/marlon-kranz) · [Email](mailto:dev@marlonkranz.com)

## Features

- Bilingual (EN/DE) with path-based routing via next-intl
- Four design themes (Atelier, Iris, Manifesto, Cobalt), each with dark and light variants
- Animated theme/language switcher with slot-machine locale animation
- Project pages authored in MDX with full component support
- Shareable URLs for theme and language preferences via query params
- Fully automated deployment: push to `main` → Docker image built → live within ~2 minutes

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 |
| Animations | Framer Motion |
| i18n | next-intl (EN/DE, path-based) |
| Theming | next-themes + custom CSS custom properties |
| Content | MDX via next-mdx-remote |
| CI/CD | GitHub Actions → GHCR → Docker + Traefik |

## Architecture

The theming system has two independent layers that compose: dark/light mode (managed by next-themes, stored as a class on `<html>`) and design themes (four palettes applied via `data-theme`, stored in localStorage). An inline script in `<head>` reads both values before hydration to prevent flash.

All site content lives in `content/{locale}/` — JSON files for structured data (experience, education, publications) and MDX for project detail pages. Server-side loaders read these at request time, keeping content changes deployable without touching application code.

## Getting Started

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # Production build
pnpm tsc --noEmit  # Type-check
```

## Content

All content lives in `content/{locale}/` and can be edited without touching application code:

- `content/{locale}/data/experience.json` — Work experience
- `content/{locale}/data/education.json` — Education
- `content/{locale}/data/certificates.json` — Certificates
- `content/{locale}/data/about.json` — Bio and intro text
- `content/{locale}/data/publications.json` — Publications
- `content/{locale}/projects/*.mdx` — Project detail pages

Where `{locale}` is `en` or `de`. The English locale is the source of truth; the German locale falls back to English where translations are missing.

## Deployment

The site runs in Docker behind Traefik, deployed automatically via GitHub Actions. Pushing to `main` builds a Docker image, pushes it to GitHub Container Registry (GHCR), and SSHes into the server to pull and restart the container — live within ~2 minutes.

### Server Setup

1. Install Docker and Docker Compose on the server
2. Add the deployment public key to `~/.ssh/authorized_keys`
3. Create a `docker-compose.yml` on the server:

```yaml
portfolio:
  image: ghcr.io/conava/portfolio-website:latest
  restart: unless-stopped
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.portfolio.rule=Host(`marlonkranz.com`)"
    - "traefik.http.routers.portfolio.entrypoints=websecure"
    - "traefik.http.routers.portfolio.tls.certresolver=letsencrypt"
    - "traefik.http.services.portfolio.loadbalancer.server.port=3000"
  networks:
    - traefik
```

### GitHub Actions Secrets

Add these in **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | Server IP or hostname |
| `DEPLOY_USER` | SSH user |
| `DEPLOY_KEY` | Private SSH key (unencrypted, contents of `~/.ssh/deploy_key`) |
| `DEPLOY_PATH` | Absolute path to `docker-compose.yml` on the server |

### Updating Content

Edit MDX/JSON files directly on GitHub and push. The pipeline runs automatically.
