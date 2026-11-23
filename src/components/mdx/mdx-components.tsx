import path from "node:path";
import { Children, isValidElement, type ComponentPropsWithoutRef, type ReactNode } from "react";
import Image from "next/image";
import type { MDXComponents } from "mdx/types";
import { Link } from "@/i18n/navigation";
import { MdxVideo } from "./mdx-video";
import { isPageHref } from "@/lib/seo";

/*
 * Plain semantic elements for project MDX. Styling comes from src/components/shared/prose.css
 * (`.pj-body`), skinned per design.
 */

const dims = new Map<string, Promise<{ width: number; height: number } | null>>();

/** Intrinsic size of a /public image, so next/image can reserve its box (no layout shift). */
function imageSize(src: string) {
  let hit = dims.get(src);
  if (!hit) {
    hit = import("sharp")
      .then(({ default: sharp }) => sharp(path.join(process.cwd(), "public", src)).metadata())
      .then((m) => (m.width && m.height ? { width: m.width, height: m.height } : null))
      .catch(() => null);
    dims.set(src, hit);
  }
  return hit;
}

/** Markdown image as a framed figure. `![Alt|sm](src)` caps the width (sm, md, lg); the alt doubles as caption. */
async function MdxImage({ src, alt: rawAlt }: ComponentPropsWithoutRef<"img">) {
  if (typeof src !== "string") return null;
  const match = (rawAlt ?? "").match(/^(.*?)\|(sm|md|lg)$/);
  const alt = (match ? match[1] : (rawAlt ?? "")).trim();
  const size = src.startsWith("/") ? await imageSize(src) : null;
  return (
    <figure className="pj-fig" data-size={match?.[2]}>
      {size ? (
        <Image src={src} alt={alt} width={size.width} height={size.height} sizes="(min-width: 900px) 880px, 100vw" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" decoding="async" />
      )}
      {alt && <figcaption aria-hidden="true">{alt}</figcaption>}
    </figure>
  );
}

/** Internal paths go through the locale-aware Link; a leading /en or /de picks that locale. */
export function MdxLink({ href = "", children, ...rest }: ComponentPropsWithoutRef<"a">) {
  const m = href.match(/^\/(en|de)(?=\/|$)(.*)$/);
  if (m) return <Link href={m[2] || "/"} locale={m[1] as "en" | "de"}>{children}</Link>;
  if (isPageHref(href)) return <Link href={href}>{children}</Link>;
  const external = /^https?:/.test(href);
  return (
    <a href={href} rel={external ? "noopener noreferrer" : undefined} {...rest}>
      {children}
    </a>
  );
}

/** Images render as figures, which may not sit inside <p>: such a paragraph becomes a <div>. */
function Paragraph({ children }: { children?: ReactNode }) {
  if (isValidElement(children) && children.type === MdxImage) return children;
  const hasImage = Children.toArray(children).some((c) => isValidElement(c) && c.type === MdxImage);
  return hasImage ? <div>{children}</div> : <p>{children}</p>;
}

export const mdxComponents: MDXComponents = {
  p: Paragraph,
  a: MdxLink,
  img: MdxImage,
  table: (props) => (
    <div className="pj-table">
      <table {...props} />
    </div>
  ),
  Video: MdxVideo,
};
