# Portfolio

Personal portfolio website — bilingual (EN/DE), dark/light mode, built with Next.js 16 + Framer Motion.

## Tech Stack

- **Framework:** Next.js 16 (App Router) + TypeScript
- **Styling:** Tailwind CSS v4
- **Animations:** Framer Motion
- **i18n:** next-intl (EN/DE, path-based)
- **Theming:** next-themes (dark default)
- **Content:** MDX via next-mdx-remote

## Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
pnpm start
```

## Content

Add/edit content in the `content/` directory:
- `content/{locale}/data/` — JSON files for experience, education, certificates, about
- `content/{locale}/projects/` — MDX files for project detail pages

## Deployment

Docker + Traefik + GitHub Actions. Pushing to `main` builds a Docker image, pushes it to GHCR, and SSHes into the server to pull and restart the container.

### docker-compose.yml

Use the pre-built image from GHCR instead of building locally:

```yaml
portfolio:
  image: ghcr.io/yourusername/portfolio:latest
  restart: unless-stopped
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.portfolio.rule=Host(`your-domain.com`)"
    - "traefik.http.routers.portfolio.entrypoints=websecure"
    - "traefik.http.routers.portfolio.tls.certresolver=letsencrypt"
    - "traefik.http.services.portfolio.loadbalancer.server.port=3000"
  networks:
    - traefik
```

### GitHub Actions secrets

Add these in **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | Your server's IP or hostname |
| `DEPLOY_USER` | SSH user (e.g. `marlon`) |
| `DEPLOY_KEY` | Private SSH key (contents of `~/.ssh/id_ed25519`) |
| `DEPLOY_PATH` | Absolute path to your `docker-compose.yml` on the server |

### Server setup

1. Add the corresponding public key to `~/.ssh/authorized_keys` on the server
2. Make the GHCR package public (**GitHub → Packages → portfolio → Package settings → Change visibility**) so the server can pull without authentication — or log in manually once:
   ```bash
   echo $CR_PAT | docker login ghcr.io -u yourusername --password-stdin
   ```

### Updating content

Edit MDX/JSON files directly on GitHub and push (or use GitHub's web editor). The pipeline runs automatically and the site is live within ~2 minutes.
