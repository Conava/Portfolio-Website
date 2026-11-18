import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { ProjectActions } from "@/components/shared/action-link";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { PanelBody } from "@/components/shared/panel/panel-body";
import { RepoFacts } from "@/components/shared/github/repo-facts";
import { Viz } from "@/components/shared/viz/viz";
import { Pad } from "@/components/trace/pad";
import { Link } from "@/i18n/navigation";
import type { Project } from "@/lib/types";
import { RevealOnce } from "@/components/shared/reveal-once";
import "./projects-contact.css";
import { isPageHref } from "@/lib/seo";

/** Trace projects: devline as a dark feature block with its pipeline, the rest as ruled rows. */
export async function TraceProjects({ content, github, locale, today }: SectionProps) {
  const t = await getTranslations("sections");
  const { projects } = content;
  const feature = projects.projects.find((p) => p.emphasis);
  const rest = projects.projects.filter((p) => p !== feature);

  const name = (p: Project) =>
    p.slug ? <Link href={`/projects/${p.slug}?from=home`}>{p.name}</Link> : p.url && isPageHref(p.url) ? <Link href={p.url}>{p.name}</Link> : p.url ? <a href={p.url}>{p.name}</a> : p.name;
  const meta = (p: Project) => {
    return (
      <p className="meta t-meta">
        {p.tech?.join(", ")}
        {p.repo && <RepoFacts repo={p.repo} github={github} locale={locale} />}
      </p>
    );
  };
  const viz = (p: Project) =>
    p.panel?.viz && <Viz viz={p.panel.viz} github={github} locale={locale} />;

  return (
    <TrackedSection id="projects" className="wrap t-projects">
      <h2>
        <Pad station="projects" label={t("projects")} kind="section" />
        {t("projects")}
      </h2>
      {projects.intro && <p className="lede">{projects.intro}</p>}

      {feature && (
        <RevealOnce className="t-feature" threshold={0.5}>
          <article id={feature.id}>
            <Pad station={feature.id} label={feature.name} kind="entry" entryId={feature.id} />
            <h3>{name(feature)}</h3>
            <p className="t-feature-blurb">{feature.blurb}</p>
            {feature.panel?.did.map((d, i) => (
              <p key={i} className="meta">{d}</p>
            ))}
            {meta(feature)}
            <p className="btn-row t-actions">
              <ProjectActions project={feature} primary />
            </p>
            {viz(feature)}
          </article>
        </RevealOnce>
      )}

      <ul className="t-rows">
        {rest.map((p) => (
          <li key={p.id} id={p.id} className="t-row">
            <Pad station={p.id} label={p.name} kind="entry" entryId={p.id} />
            <h3>{name(p)}</h3>
            <p className="prose">{p.blurb}</p>
            {meta(p)}
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
    </TrackedSection>
  );
}
