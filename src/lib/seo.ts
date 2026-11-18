import type { Metadata } from "next";
import { siteConfig } from "./site-config";
import type { Locale } from "./types";

/** Path for a locale: English is unprefixed, German lives under `/de`. Keeps `?query` and `#hash`; an already-German path is returned as is. */
export function localizedPath(path: string, locale: Locale): string {
  if (locale === "en") return path;
  if (/^\/de(?:[/?#]|$)/.test(path)) return path;
  return path.startsWith("/?") || path.startsWith("/#") ? `/de${path.slice(1)}` : path === "/" ? "/de" : `/de${path}`;
}

/** A page on this site (goes through the locale-aware Link), not a file like `/resume.pdf`, another site, or the English-only /playground. */
export function isPageHref(href: string): boolean {
  const path = href.split(/[?#]/)[0];
  return /^\/(?!\/)/.test(href) && !/\.\w+$/.test(path) && !/^\/playground(\/|$)/.test(path);
}

/** Self-referencing canonical plus hreflang alternates (path-relative; `metadataBase` makes them absolute). */
export function alternatesFor(path: string, locale: Locale): NonNullable<Metadata["alternates"]> {
  const en = localizedPath(path, "en");
  return {
    canonical: localizedPath(path, locale),
    languages: { en, de: localizedPath(path, "de"), "x-default": en },
  };
}

export function ogLocale(locale: Locale): "en_US" | "de_DE" {
  return locale === "de" ? "de_DE" : "en_US";
}

/**
 * Open Graph and Twitter blocks for a page. A page's `openGraph`/`twitter` replace the layout's
 * wholesale, so every page that sets them needs the full set (site name, locales, image).
 */
export function socialFor(input: {
  title: string;
  description: string;
  locale: Locale;
  image: { url: string; alt: string; width?: number; height?: number };
  path?: string;
  type?: "website" | "article";
  /** Article dates (YYYY-MM-DD); only set with `type: "article"`. */
  published?: string;
  modified?: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  const images = [input.image];
  return {
    openGraph: {
      type: input.type ?? "website",
      title: input.title,
      description: input.description,
      siteName: siteConfig.name,
      locale: ogLocale(input.locale),
      alternateLocale: [ogLocale(input.locale === "en" ? "de" : "en")],
      ...(input.path && { url: localizedPath(input.path, input.locale) }),
      images,
      ...(input.published && { publishedTime: input.published }),
      ...(input.modified && { modifiedTime: input.modified }),
    },
    twitter: { card: "summary_large_image", title: input.title, description: input.description, images },
  };
}

interface Org {
  name: string;
  url: string;
}

export function personJsonLd(input: {
  name: string;
  url: string;
  jobTitle: string;
  sameAs: string[];
  email?: string;
  image?: string;
  worksFor?: Org;
  alumniOf?: Org[];
}): object {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: input.name,
    url: input.url,
    jobTitle: input.jobTitle,
    sameAs: input.sameAs,
    ...(input.email && { email: `mailto:${input.email}` }),
    ...(input.image && { image: input.image }),
    ...(input.worksFor && { worksFor: { "@type": "Organization", ...input.worksFor } }),
    ...(input.alumniOf?.length && {
      alumniOf: input.alumniOf.map((o) => ({ "@type": "EducationalOrganization", ...o })),
    }),
  };
}

export function techArticleJsonLd(input: {
  url: string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
  image: string;
  inLanguage: Locale;
  author: { name: string; url: string };
}): object {
  const { author, ...rest } = input;
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    mainEntityOfPage: input.url,
    ...rest,
    author: { "@type": "Person", ...author },
  };
}

export function softwareSourceCodeJsonLd(input: {
  name: string;
  description: string;
  codeRepository: string;
  license: string;
  programmingLanguage: string;
  version?: string;
}): object {
  return { "@context": "https://schema.org", "@type": "SoftwareSourceCode", ...input };
}

export function thesisJsonLd(input: {
  name: string;
  url: string;
  author: string;
  datePublished: string;
  inSupportOf: string;
  sourceOrganization: string;
  inLanguage: "en";
}): object {
  const { author, sourceOrganization, ...rest } = input;
  return {
    "@context": "https://schema.org",
    "@type": "Thesis",
    ...rest,
    author: { "@type": "Person", name: author },
    sourceOrganization: { "@type": "Organization", name: sourceOrganization },
  };
}

/** JSON for an inline `<script type="application/ld+json">`; `<` is escaped so content can't close the tag. */
export function jsonLdHtml(data: object | object[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
