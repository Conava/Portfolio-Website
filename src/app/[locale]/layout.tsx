import type { Metadata } from "next";
import {
  Plus_Jakarta_Sans,
  JetBrains_Mono,
  Sora,
  Fraunces,
  DM_Mono,
  Cormorant_Garamond,
  Jost,
} from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import { notFound } from "next/navigation";
import Script from "next/script";
import { routing } from "@/i18n/routing";
import { Navbar } from "@/components/nav/navbar";
import { DesignThemeProvider } from "@/components/ui/design-theme-provider";
import { LS_KEY, DEFAULT_THEME, DESIGN_THEMES } from "@/lib/design-themes";
import "../globals.css";

const umamiUrl = process.env.NEXT_PUBLIC_UMAMI_URL;
const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
const isValidUmamiUrl =
  umamiUrl?.startsWith("https://analytics.marlonkranz.com") ?? false;

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  weight: ["300", "400", "500", "600", "700"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz"],
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: ["300", "400", "500"],
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["300", "400"],
});

const jost = Jost({
  subsets: ["latin"],
  variable: "--font-jost",
  weight: ["200", "300", "400", "500"],
});

export const metadata: Metadata = {
  title: "Marlon Kranz - Portfolio",
  description:
    "Full-stack software engineer based in Hamburg. B.Sc. Wirtschaftsinformatik at the University of Hamburg. Working student at OTTO. Builder of MinJ, BPMN DSL, and more.",
};

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "en" | "de")) {
    notFound();
  }

  const messages = await getMessages();

  const fontVars = [
    jakarta.variable,
    jetbrainsMono.variable,
    sora.variable,
    fraunces.variable,
    dmMono.variable,
    cormorant.variable,
    jost.variable,
  ].join(" ");

  return (
    <html lang={locale} suppressHydrationWarning className={fontVars}>
      <head>
        {/* Apply stored design theme before hydration to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var valid=${JSON.stringify([...DESIGN_THEMES])};var p=new URLSearchParams(window.location.search).get('theme');var t=(p&&valid.includes(p))?p:localStorage.getItem(${JSON.stringify(LS_KEY)});document.documentElement.setAttribute('data-theme',t||${JSON.stringify(DEFAULT_THEME)});}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        {isValidUmamiUrl && umamiWebsiteId && (
          <Script
            src={umamiUrl}
            data-website-id={umamiWebsiteId}
            strategy="afterInteractive"
          />
        )}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <DesignThemeProvider>
            <NextIntlClientProvider messages={messages}>
              <Navbar />
              <div id="scroll-root">
                {children}
              </div>
            </NextIntlClientProvider>
          </DesignThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
