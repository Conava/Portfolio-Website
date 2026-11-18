import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import Script from "next/script";
import { AnalyticsListeners } from "@/components/analytics/analytics-listeners";
import type { Design } from "@/lib/design";
import { fontVariables } from "@/lib/fonts";
import type { Locale } from "@/lib/types";
import "./globals.css";
import "../styles/ink.css";
import "../styles/trace.css";
import "../styles/flow.css";
import "../styles/type.css";

const umamiUrl = process.env.NEXT_PUBLIC_UMAMI_URL;
const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
const isValidUmamiUrl = umamiUrl?.startsWith("https://analytics.marlonkranz.com") ?? false;

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
            <AnalyticsListeners />
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
