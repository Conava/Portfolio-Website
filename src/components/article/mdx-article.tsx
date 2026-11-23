import { cache, isValidElement, type ComponentPropsWithoutRef, type ReactNode } from "react";
import type { MDXComponents } from "mdx/types";
import { compileMDX } from "next-mdx-remote/rsc";
import { getTranslations } from "next-intl/server";
import remarkGfm from "remark-gfm";
import { mdxComponents } from "@/components/mdx/mdx-components";
import { SourceLines } from "@/components/shared/bpmn/source-lines";
import type { GithubData } from "@/lib/github";
import type { ArticleMap, ArticleSlug, HomeContent, Locale } from "@/lib/types";

/** What every article MDX component can read while the page renders. */
export interface ArticleContext<S extends ArticleSlug = ArticleSlug> {
  slug: S;
  data: ArticleMap[S];
  home: HomeContent;
  github: GithubData | null;
  locale: Locale;
}

// One holder per request (React's server cache), so MDX components need no props for the data.
const holder = cache((): { current: ArticleContext | null } => ({ current: null }));

/** The article being rendered; throws outside an article page. */
export function articleContext<S extends ArticleSlug = ArticleSlug>(): ArticleContext<S> {
  const ctx = holder().current;
  if (!ctx) throw new Error("articleContext() called outside an article page");
  return ctx as ArticleContext<S>;
}

/** "Updated {date}" with a marker for `{date}` -> ["Updated ", ""], so the value can be wrapped in markup. */
export function around(format: (marker: string) => string): [string, string] {
  const marker = "\u0000";
  const [before, after = ""] = format(marker).split(marker);
  return [before, after];
}

/** Fenced `bpmnscript` blocks render highlighted, like the homepage scene; other code stays plain. */
async function Pre(props: ComponentPropsWithoutRef<"pre">) {
  const code = props.children;
  if (
    isValidElement<{ className?: string; children?: ReactNode }>(code) &&
    code.props.className === "language-bpmnscript" &&
    typeof code.props.children === "string"
  ) {
    const t = await getTranslations({ locale: articleContext().locale, namespace: "scene" });
    return <SourceLines source={code.props.children.replace(/\n$/, "")} label={t("source")} />;
  }
  return <pre {...props} />;
}

/** Compiles the article MDX with the shared components plus `components`, and sets the context they read. */
export async function compileArticle(ctx: ArticleContext, mdx: string, components: MDXComponents) {
  holder().current = ctx;
  const { content } = await compileMDX({
    source: mdx,
    components: { ...mdxComponents, pre: Pre, ...components },
    options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
  });
  return content;
}
