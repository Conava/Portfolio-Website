import { describe, expect, test } from "bun:test";
import {
  alternatesFor,
  isPageHref,
  jsonLdHtml,
  localizedPath,
  ogLocale,
  personJsonLd,
  socialFor,
  softwareSourceCodeJsonLd,
  techArticleJsonLd,
  thesisJsonLd,
} from "./seo";

describe("seo", () => {
  test("localizedPath", () => {
    expect(localizedPath("/", "en")).toBe("/");
    expect(localizedPath("/", "de")).toBe("/de");
    expect(localizedPath("/dux", "de")).toBe("/de/dux");
    expect(localizedPath("/dux", "en")).toBe("/dux");
    expect(localizedPath("/#about", "de")).toBe("/de#about");
    expect(localizedPath("/#x", "de")).toBe("/de#x");
    expect(localizedPath("/?a", "de")).toBe("/de?a");
    expect(localizedPath("/dux?a=1#b", "de")).toBe("/de/dux?a=1#b");
  });

  test("localizedPath does not double-prefix", () => {
    for (const p of ["/de", "/de/dux", "/de?a", "/de#x"]) expect(localizedPath(p, "de")).toBe(p);
    expect(localizedPath("/design", "de")).toBe("/de/design");
  });

  test("isPageHref: site pages yes, files and other sites no", () => {
    for (const h of ["/", "/dux", "/projects/minj?from=home", "/#projects", "/v1.2/x"]) expect(isPageHref(h)).toBe(true);
    for (const h of ["/resume.pdf", "/thesis.pdf#page=3", "https://github.com/x", "mailto:a@b.c", "//cdn.x/y", "", "/playground", "/playground#src=x"]) expect(isPageHref(h)).toBe(false);
    expect(isPageHref("/playgrounds")).toBe(true);
  });

  test("alternatesFor", () => {
    expect(alternatesFor("/dux", "de")).toEqual({
      canonical: "/de/dux",
      languages: { en: "/dux", de: "/de/dux", "x-default": "/dux" },
    });
    expect(alternatesFor("/", "en").canonical).toBe("/");
  });

  test("ogLocale", () => {
    expect(ogLocale("de")).toBe("de_DE");
    expect(ogLocale("en")).toBe("en_US");
  });

  test("jsonLdHtml escapes <", () => {
    const html = jsonLdHtml({ a: "</script>" });
    expect(html).not.toContain("</script>");
    expect(JSON.parse(html).a).toBe("</script>");
  });

  test("techArticleJsonLd", () => {
    const ld = techArticleJsonLd({
      url: "https://x.test/dux",
      headline: "h",
      description: "d",
      datePublished: "2026-01-02",
      dateModified: "2026-02-03",
      image: "https://x.test/i.png",
      inLanguage: "en",
      author: { name: "A", url: "https://x.test" },
    }) as Record<string, unknown>;
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("TechArticle");
    expect(ld.author).toEqual({ "@type": "Person", name: "A", url: "https://x.test" });
    expect(ld.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("thesisJsonLd", () => {
    const ld = thesisJsonLd({
      name: "T",
      url: "u",
      author: "A",
      datePublished: "2025-01-01",
      inSupportOf: "B.Sc.",
      sourceOrganization: "Uni",
      inLanguage: "en",
    }) as Record<string, unknown>;
    expect(ld["@type"]).toBe("Thesis");
    expect(ld.author).toEqual({ "@type": "Person", name: "A" });
  });

  test("jsonLdHtml escapes <!--", () => {
    const html = jsonLdHtml({ a: "<!-- x" });
    expect(html).not.toContain("<!--");
    expect(JSON.parse(html).a).toBe("<!-- x");
  });

  test("personJsonLd without optional fields", () => {
    const p = personJsonLd({ name: "A", url: "https://a.b", jobTitle: "Dev", sameAs: ["https://g"] }) as Record<string, unknown>;
    expect(p["@type"]).toBe("Person");
    expect(p.sameAs).toEqual(["https://g"]);
    expect("worksFor" in p).toBe(false);
    expect("alumniOf" in p).toBe(false);
    expect("alumniOf" in (personJsonLd({ name: "A", url: "u", jobTitle: "D", sameAs: [], alumniOf: [] }) as object)).toBe(false);
  });

  test("personJsonLd with worksFor and alumniOf", () => {
    const p = personJsonLd({
      name: "A",
      url: "u",
      jobTitle: "D",
      sameAs: [],
      worksFor: { name: "Co", url: "https://co" },
      alumniOf: [{ name: "Uni", url: "https://uni" }],
    });
    expect(p).toMatchObject({
      worksFor: { "@type": "Organization", name: "Co", url: "https://co" },
      alumniOf: [{ "@type": "EducationalOrganization", name: "Uni", url: "https://uni" }],
    });
  });

  test("personJsonLd email and image", () => {
    expect(personJsonLd({ name: "A", url: "u", jobTitle: "D", sameAs: [], email: "a@b.c", image: "https://i" })).toMatchObject({
      email: "mailto:a@b.c",
      image: "https://i",
    });
  });

  test("socialFor sets both blocks, with a localized url only when a path is given", () => {
    const img = { url: "/i.jpg", alt: "x" };
    const de = socialFor({ title: "T", description: "D", locale: "de", image: img, path: "/dux" });
    expect(de.openGraph).toMatchObject({ locale: "de_DE", alternateLocale: ["en_US"], url: "/de/dux", images: [img] });
    expect(de.twitter).toMatchObject({ card: "summary_large_image", images: [img] });
    expect("url" in socialFor({ title: "T", description: "D", locale: "en", image: img }).openGraph!).toBe(false);
  });

  test("socialFor article dates and site name", () => {
    const img = { url: "/i.jpg", alt: "x" };
    const a = socialFor({ title: "T", description: "D", locale: "en", image: img, type: "article", published: "2026-01-02", modified: "2026-03-04" });
    expect(a.openGraph).toMatchObject({ type: "article", siteName: "Marlon Kranz", publishedTime: "2026-01-02", modifiedTime: "2026-03-04" });
  });

  test("softwareSourceCodeJsonLd", () => {
    expect(
      softwareSourceCodeJsonLd({
        name: "n",
        description: "d",
        codeRepository: "https://github.com/x/y",
        license: "MIT",
        programmingLanguage: "Go",
      }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: "n",
      description: "d",
      codeRepository: "https://github.com/x/y",
      license: "MIT",
      programmingLanguage: "Go",
    });
  });
});
