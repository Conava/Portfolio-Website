import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // React's dev build uses eval() for its debug tooling; production never does.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://analytics.marlonkranz.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self' https://analytics.marlonkranz.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the root: a checkout nested inside another (a git worktree) would otherwise make
  // Turbopack pick the outer lockfile and fail to resolve next/font files.
  turbopack: {
    root: __dirname,
    // The Monaco VS Code API does `import * as css from "./x.css"` and adopts the default export as a
    // stylesheet; Turbopack (16.4+) rejects a namespace import of CSS, so hand it the text instead.
    rules: { "*.css": { condition: { path: /node_modules\/@codingame\// }, type: "raw" } },
  },
  // Unknown URLs get a server-rendered, designed 404 (src/app/global-not-found.tsx).
  experimental: { globalNotFound: true },
  // A dotted path skips the proxy (src/proxy.ts matcher), so `/wp-login.php` would land in
  // [locale] with "wp-login.php" as the locale. After the files (public, /resume.pdf, ...) are
  // tried, any first segment that is not a locale moves under /en, which matches no page.
  // (A plain array is applied after the files.)
  rewrites: async () => [
    { source: "/:first((?!(?:en|de|_next|api)(?:/|$))[^/]+)/:rest*", destination: "/en/:first/:rest*" },
  ],
  // The playground is English only.
  redirects: async () => [{ source: "/de/playground/:rest*", destination: "/playground/:rest*", permanent: true }],
  headers: async () => [
    { source: "/(.*)", headers: securityHeaders },
  ],
};

export default withNextIntl(nextConfig);
