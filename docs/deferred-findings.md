# Deferred Findings

## 2026-03-10 — T03: .env.example blocked by file-guard hook

- **Finding**: T03 `.env.example` could not be created automatically
- **Location**: `.env.example` (project root)
- **Severity**: Important
- **Status**: DEFERRED
- **Why deferred**: The file-guard pre-commit hook prevents automated creation of dotfiles. Requires manual creation by the user.
- **Suggested fix**: Manually create `.env.example` in the project root with the two required analytics env vars (`NEXT_PUBLIC_UMAMI_URL`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID`).
