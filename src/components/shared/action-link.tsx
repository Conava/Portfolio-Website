import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Project } from "@/lib/types";
import { ArrowRightIcon, DownloadIcon, ExternalIcon, GithubMark, LinkedinMark } from "./icons";
import { isArticleHref, isPageHref } from "@/lib/seo";
import { articlesLive } from "@/lib/site-config";

/**
 * A link styled as a button (`.btn`, `.btn-primary` for the section's one main action).
 * Site pages go through the locale-aware Link with a trailing arrow; files (`/resume.pdf`)
 * stay plain unprefixed URLs with a download icon; github.com and linkedin.com links lead with their mark;
 * other sites keep the external mark. Always an `<a>`, so the delegated analytics listener sees it.
 * Renders nothing for an unpublished article. Server-rendered only: the client has no `ARTICLES` env.
 */
export function ActionLink({ href, children, primary }: { href: string; children: ReactNode; primary?: boolean }) {
  if (isArticleHref(href) && !articlesLive()) return null;
  const className = primary ? "btn btn-primary" : "btn";
  const external = /^https?:/.test(href);
  if (isPageHref(href)) {
    return (
      <Link className={className} href={href}>
        {children}
        <ArrowRightIcon />
      </Link>
    );
  }
  // A same-site path without a file extension is a page outside the locale routing (/playground).
  const file = /\.\w+$/.test(href.split(/[?#]/)[0]);
  return (
    <a className={className} href={href} rel={external ? "noopener" : undefined}>
      {/^https:\/\/github\.com\//.test(href) ? (
        <GithubMark />
      ) : /^https:\/\/(www\.)?linkedin\.com\//.test(href) ? (
        <LinkedinMark />
      ) : (
        file && href.startsWith("/") && <DownloadIcon />
      )}
      {children}
      {external && <ExternalIcon />}
      {!external && !file && <ArrowRightIcon />}
    </a>
  );
}

/**
 * The header's resume button, visible at every width. A plain file link (no locale prefix);
 * phones get the short label so the header row keeps its room.
 */
export function ResumeButton() {
  const t = useTranslations("hero");
  return (
    <a className="btn hdr-resume" href="/resume.pdf">
      <DownloadIcon />
      <span className="hdr-resume-long">{t("resume")}</span>
      <span className="hdr-resume-short">
        {t("resumeShort")}
      </span>
    </a>
  );
}

/**
 * A project's actions: its write-up (project page, or the article for a project whose `url` is a
 * site page; `primary` makes that one the main action) and its GitHub repository.
 */
export async function ProjectActions({ project: p, primary }: { project: Project; primary?: boolean }) {
  const t = await getTranslations("projects");
  return (
    <>
      {p.slug ? (
        <ActionLink href={`/projects/${p.slug}?from=home`}>{t("page")}</ActionLink>
      ) : (
        p.url?.startsWith("/") && (
          <ActionLink href={p.url} primary={primary}>
            {t("article")}
          </ActionLink>
        )
      )}
      {p.repo && <ActionLink href={`https://github.com/${p.repo}`}>{t("github")}</ActionLink>}
    </>
  );
}
