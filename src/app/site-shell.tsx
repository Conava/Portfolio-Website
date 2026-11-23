import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import Script from "next/script";
import { AnalyticsListeners } from "@/components/analytics/analytics-listeners";
import { SiteSwitchesProvider } from "@/components/shared/controls/site-switches";
import { ResumeChooser } from "@/components/shared/resume-chooser";
import type { Design } from "@/lib/design";
import { fontVariables } from "@/lib/fonts";
import { hasGermanResume } from "@/lib/resume";
import { enabledDesigns, germanLive } from "@/lib/site-config";
import type { Locale } from "@/lib/types";
import "./globals.css";
import "../styles/ink.css";
import "../styles/trace.css";
import "../styles/flow.css";
import "../styles/type.css";

const umamiUrl = process.env.NEXT_PUBLIC_UMAMI_URL;
const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
// Only the self-hosted instance: compare the parsed origin, so "https://analytics.marlonkranz.com.evil.example" fails.
const isValidUmamiUrl = !!umamiUrl && URL.canParse(umamiUrl) && new URL(umamiUrl).origin === "https://analytics.marlonkranz.com";

/** The document around every page: <html data-design>, and providers; the header and footer are SiteChrome's. */
export async function SiteShell({
  locale,
  design,
  children,
}: {
  locale: Locale;
  design: Design;
  children: React.ReactNode;
}) {
  const messages = await getMessages({ locale });

  return (
    <html lang={locale} data-design={design} className={fontVariables} suppressHydrationWarning>
      <head>
        {/* The site has its own dark mode; Dark Reader's inline attributes break hydration. */}
        <meta name="darkreader-lock" />
      </head>
      <body>
        {isValidUmamiUrl && umamiWebsiteId && (
          <Script src={umamiUrl} data-website-id={umamiWebsiteId} strategy="afterInteractive" />
        )}
        {/* Flow is dark only: its glow needs a dark ground. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          forcedTheme={design === "flow" ? "dark" : undefined}
        >
          <NextIntlClientProvider locale={locale} messages={messages}>
            <SiteSwitchesProvider value={{ designs: enabledDesigns(), german: germanLive() }}>
              <AnalyticsListeners />
              {hasGermanResume() && <ResumeChooser locale={locale} />}
              {children}
            </SiteSwitchesProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
