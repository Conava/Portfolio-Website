import { ArticlePage, articleMetadata } from "@/components/article/article-page";
import type { Locale } from "@/lib/types";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return articleMetadata("bpmnscript", (await params).locale as Locale);
}

export default async function Page({ params }: Props) {
  return (
    <main id="main" className="pj ar">
      <ArticlePage slug="bpmnscript" locale={(await params).locale as Locale} />
    </main>
  );
}
