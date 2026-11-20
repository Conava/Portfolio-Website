import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { formatDate, formatLineChanges } from "@/lib/format";
import { freshness, parsePrRef, type GithubData } from "@/lib/github";
import { lookupPr } from "@/lib/github-lookup";
import { siteConfig } from "@/lib/site-config";
import type { FeaturedPr, Locale } from "@/lib/types";
import { StatusBadge } from "./status-badge";
import { SyncLine } from "./sync-line";
import "./github.css";

/**
 * Ledger of featured PRs: the `repo#number` link, then the plain-language note (title as fallback).
 * Live data adds badge, meta and the sync line; without it text and links remain. A PR with an
 * `image` shows it small beside the blurb, linked to the full-size file.
 * `sync={false}` drops the sync line, for pages that show several lists and one line after the last.
 */
export async function PrList({
  featured,
  github,
  locale,
  sync = true,
}: {
  featured: FeaturedPr[];
  github: GithubData | null;
  locale: Locale;
  sync?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "github" });
  const fresh = github ? freshness(github.fetchedAt, new Date()) : "expired";
  const live = github && fresh !== "expired" ? github : null;
  return (
    <>
      <ul className="gh-list">
        {featured.map((f) => {
          const pr = lookupPr(live, f.ref, siteConfig.duxOrg);
          const ref = parsePrRef(f.ref, siteConfig.duxOrg);
          const url = pr?.url ?? (ref ? `https://github.com/${ref.owner}/${ref.name}/pull/${ref.number}` : null);
          // The plain-language note reads better than a commit-style title; the title is the fallback.
          const text = f.note ?? pr?.title ?? f.title;
          const label = f.ref.replace(/^[^/]+\//, "");
          const meta = pr
            ? [
                pr.state === "MERGED" && pr.mergedAt ? t("mergedOn", { date: formatDate(pr.mergedAt, locale) }) : null,
                formatLineChanges(pr.additions, pr.deletions, locale),
                pr.reviews > 0 ? t("reviews", { count: pr.reviews }) : null,
              ].filter((m): m is string => !!m)
            : [];
          return (
            <li key={f.ref} className="gh-row">
              <div className="gh-head">
                {url ? (
                  <a className="gh-ref" href={url}>
                    <code>{label}</code>
                  </a>
                ) : (
                  <code className="gh-ref">{label}</code>
                )}
                <span className="gh-title">{text}</span>
                {pr && <StatusBadge state={pr.state} locale={locale} />}
              </div>
              {meta.length > 0 && (
                <p className="gh-meta">
                  {meta.map((m) => (
                    <span key={m}>{m}</span>
                  ))}
                </p>
              )}
              {f.image ? (
                <div className="gh-feat">
                  {f.blurb && <p className="gh-blurb">{f.blurb}</p>}
                  <a className="gh-shot" href={f.image.src}>
                    <Image src={f.image.src} alt={f.image.alt} width={f.image.width} height={f.image.height} sizes="176px" loading="lazy" />
                  </a>
                </div>
              ) : (
                f.blurb && <p className="gh-blurb">{f.blurb}</p>
              )}
            </li>
          );
        })}
      </ul>
      {live && sync && <SyncLine fetchedAt={live.fetchedAt} locale={locale} stale={fresh === "stale"} />}
    </>
  );
}
