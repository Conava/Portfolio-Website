import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { ProjectActions } from "@/components/shared/action-link";
import { RepoFacts } from "@/components/shared/github/repo-facts";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { PanelBody } from "@/components/shared/panel/panel-body";
import { Viz } from "@/components/shared/viz/viz";
// ponytail: reuses Trace's tiny once-only IntersectionObserver wrapper rather than a second copy.
import { RevealOnce } from "@/components/shared/reveal-once";
import { Link } from "@/i18n/navigation";
import type { Project } from "@/lib/types";
import { InkDuxProjects } from "./dux-projects";
import "./projects-contact.css";
import { isPageHref } from "@/lib/seo";

/**
 * Ink projects: ruled rows, no cards. devline leads at full h3 size with its pipeline drawn in
 * the row itself (the pipeline is the argument; behind a "read more" it would be easy to miss).
 * Dux Player follows in its scene band, then the plugins, then the other projects.
 */
export async function InkProjects({ content, github, locale, today }: SectionProps) {
  const t = await getTranslations("sections");
  const { projects } = content;
  const feature = projects.projects.find((p) => p.emphasis);
  const rest = projects.projects.filter((p) => p !== feature);

  const name = (p: Project) =>
    p.slug ? <Link href={`/projects/${p.slug}?from=home`}>{p.name}</Link> : p.url && isPageHref(p.url) ? <Link href={p.url}>{p.name}</Link> : p.url ? <a href={p.url}>{p.name}</a> : p.name;
  const meta = (p: Project) => (
    <p className="meta">
      {p.tech?.join(", ")}
      {p.repo && <RepoFacts repo={p.repo} github={github} locale={locale} />}
    </p>
  );
  const viz = (p: Project) =>
    p.panel?.viz && <Viz viz={p.panel.viz} github={github} locale={locale} />;

  return (
    <TrackedSection id="projects" data-tone="paper" className="ink-projects">
      <div className="wrap">
        <h2>{t("projects")}</h2>
        {projects.intro && <p className="lede">{projects.intro}</p>}

        <ul className="ip-rows">
          {feature && (
            <li id={feature.id} className="ip-row ip-feature grid-12">
              <h3>{name(feature)}</h3>
              <div className="ip-body">
                <p className="prose">{feature.blurb}</p>
                {feature.panel?.did.map((d, i) => (
                  <p key={i} className="prose">{d}</p>
                ))}
                {meta(feature)}
                <p className="btn-row ip-actions">
                  <ProjectActions project={feature} primary />
                </p>
              </div>
              <RevealOnce className="ip-viz" threshold={0.5}>
                {viz(feature)}
              </RevealOnce>
            </li>
          )}
        </ul>
      </div>

      {/* Dux Player, the plugins and dux-cast come second; the rest stay compact below them. */}
      <InkDuxProjects content={content} github={github} locale={locale} today={today} />

      <div className="wrap">
        <ul className="ip-rows">
          {rest.map((p) => (
            <li key={p.id} id={p.id} className="ip-row grid-12">
              <h3>{name(p)}</h3>
              <div className="ip-body">
                <p className="prose">{p.blurb}</p>
                {meta(p)}
              </div>
              {p.panel ? (
                <DetailPanel id={p.id} name={p.name} section="projects" actions={<ProjectActions project={p} />}>
                  <PanelBody panel={p.panel} viz={viz(p)} />
                </DetailPanel>
              ) : (
                <p className="btn-row dp-actions">
                  <ProjectActions project={p} />
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </TrackedSection>
  );
}
