import { getDesign } from "@/lib/design";
import type { Locale } from "@/lib/types";
import { SiteChrome } from "../../site-chrome";

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <SiteChrome locale={locale as Locale} design={await getDesign()}>
      {children}
    </SiteChrome>
  );
}
