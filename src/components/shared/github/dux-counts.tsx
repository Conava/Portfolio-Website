import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/lib/format";
import { freshness, type GithubData } from "@/lib/github";
import type { Locale } from "@/lib/types";

/** Sentence fragment "66 merged pull requests in 7 repos, 8 open", or null without usable data. */
export async function DuxCounts({ github, locale }: { github: GithubData | null; locale: Locale }) {
  if (!github?.org || freshness(github.fetchedAt, new Date()) === "expired") return null;
  const t = await getTranslations({ locale, namespace: "github" });
  const { merged, open, repoCount } = github.org;
  return <>{t("duxCounts", { merged: formatNumber(merged, locale), open: formatNumber(open, locale), repos: repoCount })}</>;
}
