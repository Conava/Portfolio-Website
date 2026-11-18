import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { around, articleContext } from "./mdx-article";

/** A figure from the article's `figures`: framed image, or on the light plate (`plate`), with caption and credit. */
export async function Figure({ id }: { id: string }) {
  const { data, locale } = articleContext();
  const f = data.figures.find((x) => x.id === id);
  if (!f) throw new Error(`No figure with id "${id}" in the article JSON`);
  const t = await getTranslations({ locale, namespace: "article" });
  const [before, after] = around((m) => t("credit", { source: m }));
  // Only diagrams on the plate break out of the figure column: their labels need the width.
  // Screenshots stay in the column, so their text is never larger than the prose beside them.
  const wide = !!f.plate && f.width > 880;

  const image = (
    <Image
      src={f.src}
      alt={f.alt}
      width={f.width}
      height={f.height}
      sizes={wide ? "(min-width: 900px) 1280px, 100vw" : "(min-width: 900px) 880px, 100vw"}
      // next/image does not optimize SVG; serve it as is.
      unoptimized={f.src.endsWith(".svg")}
      // Diagrams scroll inside the plate rather than shrink past legibility.
      style={f.plate ? { minWidth: Math.min(f.width, 720) } : undefined}
    />
  );
  return (
    <figure className="pj-fig ar-fig" data-plate={f.plate ? "" : undefined} data-wide={wide ? "" : undefined}>
      {f.plate ? (
        // Scrolls sideways where the diagram is wider than the plate: focusable, with an edge fade as the cue.
        <div className="ar-plate" tabIndex={0} role="region" aria-label={f.alt}>
          {image}
        </div>
      ) : (
        image
      )}
      {(f.caption || f.credit) && (
        <figcaption>
          {f.caption}
          {f.credit && (
            <span className="ar-credit">
              {before}
              <a href={f.credit.href} rel="noopener noreferrer">
                {f.credit.label}
              </a>
              {after}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}
