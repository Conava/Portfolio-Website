import { getTranslations } from "next-intl/server";
import { freshness, type GithubData } from "@/lib/github";
import type { Locale } from "@/lib/types";
import "./github.css";

/** Inline "1,204 stars", "latest release v1.2" as spaced spans; null when the repo has no live data or nothing to show. */
export async function RepoFacts({ repo, github, locale }: { repo: string; github: GithubData | null; locale: Locale }) {
  const info = github?.repos[repo.toLowerCase()];
  if (!github || !info || freshness(github.fetchedAt, new Date()) === "expired") return null;
  const t = await getTranslations({ locale, namespace: "github" });
  const tag = info.latestRelease?.tag ?? info.latestTag;
  // "0 stars" says nothing about the project; leave it out.
  const parts = [...(info.stars > 0 ? [t("stars", { count: info.stars })] : []), ...(tag ? [t("release", { tag })] : [])];
  if (!parts.length) return null;
  return (
    <span className="gh-facts">
      {parts.map((p) => (
        <span key={p}>{p}</span>
      ))}
    </span>
  );
}
