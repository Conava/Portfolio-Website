import Image from "next/image";
import { isPageHref } from "@/lib/seo";
import type { CSSProperties, ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { ActionLink, ProjectActions } from "@/components/shared/action-link";
import { CopyEmail } from "@/components/shared/copy-email";
import { DuxCounts } from "@/components/shared/github/dux-counts";
import { PrList } from "@/components/shared/github/pr-list";
import { RepoFacts } from "@/components/shared/github/repo-facts";
import { DownloadIcon } from "@/components/shared/icons";
import { StatusLine } from "@/components/shared/status-line";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { PanelBody } from "@/components/shared/panel/panel-body";
import { Viz } from "@/components/shared/viz/viz";
import { DuxBuiltOn, DuxRelations } from "@/components/shared/dux-relations";
import { Gallery } from "@/components/shared/gallery";
import { Link } from "@/i18n/navigation";
import { formatMonth, formatRange } from "@/lib/format";
import type { Image as Img, Job, Panel, Project, YearMonth } from "@/lib/types";
import { FlowBpmnscript } from "./bpmnscript";
import { FlowCanvas } from "./flow-canvas";
import { sceneData, workOrder } from "./scene-data";
import "./flow.css";

/** A short intro reads as the lede; a long one (several sentences) as large body text. */
const lede = (text: string) => (text.length > 200 ? "fl-p fl-big" : "fl-lede");

/**
 * Employers that set their name as a wordmark, shown as that artwork (its dark-ground file, no
 * plate) with its clear space. `k`: height relative to the context's base (`--wm` in flow.css), so
 * marks of different shapes carry a similar weight; `cs`: clear space as a share of the height.
 * An employer without a mark that works on a dark ground keeps its plain name.
 */
const MARKS: Record<string, { src: string; w: number; h: number; k: number; cs: number }> = {
  adobe: { src: "/images/logos/adobe-dark.svg", w: 66.25, h: 16.75, k: 0.87, cs: 1 },
  otto: { src: "/images/logos/otto-dark.svg", w: 100, h: 37, k: 1, cs: 0.9 },
  "msg-life": { src: "/images/logos/msg-life-dark.svg", w: 493.4, h: 157.7, k: 1.1, cs: 0.4 },
};

/** The employer's name as it sets it: its wordmark (alt text is the name), else the name in type. */
function Employer({ job, as: H = "h3" }: { job: Job; as?: "h3" | "p" }) {
  const m = MARKS[job.id];
  const h = Math.round(64 * (m?.k ?? 1));
  const name = m ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.src} alt={job.company} width={Math.round((m.w / m.h) * h)} height={h} style={{ "--k": m.k, "--cs": m.cs } as CSSProperties} />
  ) : (
    job.company
  );
  return (
    <H className={m ? "fl-wm" : "fl-wm fl-wm-text"}>
      <a href={job.url}>{name}</a>
    </H>
  );
}

/** A school's logo for dark grounds (the `-dark` file beside it), sized by `--lh` in flow.css. */
function SchoolMark({ logo }: { logo: Img }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logo.src.replace(/\.svg$/, "-dark.svg")} alt="" width={logo.width} height={logo.height} style={{ "--ar": logo.width / logo.height } as CSSProperties} />;
}

/** A beat's headline: one plain sentence in one face and colour. */
function Headline({ as: H = "h2", text, label }: { as?: "h1" | "h2" | "h3"; text: string; label?: string }) {
  return (
    <H className="fl-hl">
      {label && <span className="sr-only">{label}: </span>}
      {text}
    </H>
  );
}

/**
 * Where a beat's form sits (from 1200px): `l` / `r` in the wide column on the left / right, under
 * the headline, held there while the narrow text column beside it is read. The sides alternate.
 */
type Composition = "l" | "r";

/**
 * One beat: headline and stage (the box the form is fitted into) in the wide column, the text in
 * the narrow one. On narrow screens the stage is a band between headline and text. Text items
 * marked `data-item` match a part of the form; `stage` holds labels the scene places on the form.
 */
function Beat({
  beat,
  idx,
  head,
  children,
  id,
  at,
  stage,
}: {
  beat: number;
  idx: string;
  head: ReactNode;
  children: ReactNode;
  id?: string;
  at: Composition;
  stage?: ReactNode;
}) {
  return (
    <div id={id} className="fl-beat" data-beat={beat} data-at={at}>
      <div className="fl-inner">
        <div className="fl-head">
          <span className="fl-idx" aria-hidden="true">
            {idx}
          </span>
          {head}
        </div>
        <div className="fl-stage" data-stage="stick">
          {stage}
        </div>
        <div className="fl-body">{children}</div>
      </div>
    </div>
  );
}

export async function FlowHome({ content, github, locale, today }: SectionProps) {
  const t = await getTranslations();
  const { about, work, education, dux, projects, contact } = content;
  const range = (s: YearMonth, e: YearMonth | null) => formatRange(s, e, locale, t("date.present"));
  const viz = (p?: Panel) =>
    p?.viz && <Viz viz={p.viz} github={github} locale={locale} />;

  const { current, lead, others } = workOrder(work.jobs);
  const curDid = current?.panel?.did ?? [];
  const curRest: Panel | null =
    current?.panel && (curDid.length > 2 || current.panel.significant || current.panel.viz)
      ? { ...current.panel, did: curDid.slice(2) }
      : null;

  const since = Math.min(...work.jobs.map((j) => +j.start.slice(0, 4)));
  const jobMeta = (j: Job) => (
    <p className="fl-meta rv">
      <span>{j.role}</span>
      <span>
        {range(j.start, j.end)}, {j.location}
      </span>
    </p>
  );
  const jobPanel = (j: Job, panel: Panel | undefined | null = j.panel) =>
    panel && (
      <div className="rv">
        <DetailPanel id={j.id} name={j.company} section="work">
          <PanelBody panel={panel} viz={viz(panel)} />
        </DetailPanel>
      </div>
    );

  const feature = projects.projects.find((p) => p.emphasis) ?? projects.projects[0];
  const restProjects = projects.projects.filter((p) => p !== feature);
  const duxLead = dux.projects.find((p) => p.id === "dux-player");
  const duxShot = dux.shellImages?.[0];
  const projName = (p: Project) =>
    p.slug ? <Link href={`/projects/${p.slug}?from=home`}>{p.name}</Link> : p.url && isPageHref(p.url) ? <Link href={p.url}>{p.name}</Link> : p.name;
  const counts = await DuxCounts({ github, locale });
  const [first, ...rest] = about.name.split(" ");

  return (
    <div className="fl" data-flow>
      {/* Without JS the stages would only leave empty space. */}
      <noscript>
        <style>{`.fl-stage{display:none}.fl-beat[data-at] .fl-inner{grid-template-columns:minmax(0,40rem)}.fl-beat[data-at] :is(.fl-head,.fl-body){grid-column:1;grid-row:auto;justify-self:start}.fl-step{min-height:0;margin-bottom:14px}`}</style>
      </noscript>
      <FlowCanvas data={sceneData(content, today)} />
      <div className="fl-rail" data-rail aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i}>{String(i).padStart(2, "0")}</span>
        ))}
      </div>

      <section id="top" className="fl-hero" data-beat={0}>
        <div className="fl-stage" data-stage="full" />
        <div className="fl-head">
          <h1 className="fl-hl">
            {first} <span>{rest.join(" ")}</span>
          </h1>
        </div>
        <div className="fl-hero-foot">
          <div>
            <p className="fl-lede">{about.lede}</p>
            <StatusLine content={content} locale={locale} today={today} className="fl-status" />
          </div>
          <p className="btn-row">
            <a className="btn btn-primary" href="/resume.pdf">
              <DownloadIcon />
              {t("hero.resume")}
            </a>
            <a className="btn" href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
          </p>
        </div>
      </section>

      <TrackedSection id="about" className="fl-sec">
        <Beat beat={1} idx="01" at="r" head={<Headline text={t("flow.about")} label={t("sections.about")} />}>
          <p className="fl-kick rv" aria-hidden="true">{t("sections.about")}</p>
          <p className="fl-lede rv">{about.statement[0]}</p>
          {about.statement.slice(1).map((s) => (
            <p key={s} className="fl-p rv">
              {s}
            </p>
          ))}
          <ul className="btn-row rv">
            {about.links.map((l) => (
              <li key={l.href}>
                <ActionLink href={l.href}>{l.label}</ActionLink>
              </li>
            ))}
          </ul>
        </Beat>
      </TrackedSection>

      <TrackedSection id="work" className="fl-sec">
        {lead && (
          <Beat beat={2} idx="02" at="l" head={<Headline text={t("flow.work", { year: String(since) })} label={t("sections.work")} />}>
            <p className="fl-kick rv" aria-hidden="true">{t("sections.work")}</p>
            <div id={lead.id} data-item={0}>
              <div className="rv">
                <Employer job={lead} />
              </div>
              {jobMeta(lead)}
              <p className="fl-lede rv">{lead.summary}</p>
              {jobPanel(lead)}
            </div>
            {others.map((j, i) => (
              <div key={j.id} id={j.id} className="fl-entry rv" data-item={i + 1}>
                <Employer job={j} />
                <p className="fl-meta">
                  <span>{j.role}</span>
                  <span>{range(j.start, j.end)}</span>
                </p>
                <p className="fl-p">{j.summary}</p>
                {jobPanel(j)}
              </div>
            ))}
          </Beat>
        )}
        {current && (
          <>
            <Beat beat={3} idx="03" at="r" id={current.id} head={<Employer job={current} />}>
              {jobMeta(current)}
              <p className="fl-p fl-big rv">{current.summary}</p>
            </Beat>
            <Beat beat={4} idx="04" at="l" head={null}>
              <p className="fl-kick rv" aria-hidden="true">{current.company}</p>
              {curDid.slice(0, 2).map((d, i) => (
                <div key={d} className="fl-step" data-item={i}>
                  <span className="fl-step-n" aria-hidden="true">
                    {i + 1}/2
                  </span>
                  <p className="fl-lede">{d}</p>
                </div>
              ))}
              {jobPanel(current, curRest)}
            </Beat>
          </>
        )}
      </TrackedSection>

      <TrackedSection id="education" className="fl-sec">
        <Beat
          beat={5}
          idx="05"
          at="r"
          head={<Headline text={t("flow.education")} label={t("sections.education")} />}
          stage={
            <ul className="fl-labs" aria-hidden="true">
              {education.schools.map((s, i) => (
                <li key={s.id} data-label={i} data-upcoming={s.status === "upcoming" ? "" : undefined}>
                  <SchoolMark logo={s.logo} />
                  <span>
                    {s.degree}, {s.status === "upcoming" ? t("dates.from", { date: formatMonth(s.start, locale) }) : `${s.start.slice(0, 4)}–⁠${(s.end ?? today).slice(0, 4)}`}
                  </span>
                </li>
              ))}
            </ul>
          }
        >
          <p className="fl-kick rv" aria-hidden="true">{t("sections.education")}</p>
          {education.intro && <p className={`${lede(education.intro)} rv`}>{education.intro}</p>}
          {education.schools.map((s, i) => (
            <div key={s.id} id={s.id} className="fl-entry rv" data-item={i}>
              <h3>
                <a href={s.url}>{s.name}</a>
              </h3>
              <p className="fl-meta">
                <span>
                  {s.degree}, {s.field}
                </span>
                <span>{s.status === "upcoming" ? t("dates.from", { date: formatMonth(s.start, locale) }) : range(s.start, s.end)}</span>
                {s.gpa && <span>{t("education.gpa", s.gpa)}</span>}
              </p>
              {s.note && <p className="fl-p">{s.note}</p>}
              {s.panel && (
                <DetailPanel id={s.id} name={s.name} section="education">
                  <PanelBody panel={s.panel} viz={viz(s.panel)} />
                </DetailPanel>
              )}
            </div>
          ))}
        </Beat>
      </TrackedSection>

      <TrackedSection id="bpmnscript" className="fl-sec">
        <Beat beat={6} idx="06" at="l" head={<Headline text={t("flow.bpmnscript")} label={t("sections.bpmnscript")} />}>
          <FlowBpmnscript content={content} locale={locale} />
        </Beat>
      </TrackedSection>

      <TrackedSection id="dux" className="fl-sec">
        <Beat beat={7} idx="07" at="r" head={<Headline text={t("flow.dux")} label={t("sections.dux")} />}>
          <p className="fl-kick rv" aria-hidden="true">{t("sections.dux")}</p>
          <p className={`${lede(dux.intro)} rv`}>
            {dux.intro}
            {counts && (
              <>
                {" "}
                <span className="num">{counts}.</span>
              </>
            )}
          </p>
          {duxShot && (
            <figure className="fl-shot rv">
              <Image src={duxShot.src} alt={duxShot.alt} width={duxShot.width} height={duxShot.height} sizes="(min-width: 1200px) 40rem, 92vw" />
              {duxShot.caption && <figcaption className="fl-meta">{duxShot.caption}</figcaption>}
            </figure>
          )}
          <div className="rv" data-item-list>
            <PrList featured={dux.featuredPrs} github={github} locale={locale} />
          </div>
          <ul className="btn-row rv">
            {dux.links.map((l) => (
              <li key={l.href}>
                <ActionLink href={l.href} primary={l.href === "/dux"}>
                  {l.label}
                </ActionLink>
              </li>
            ))}
          </ul>
          {dux.panel && (
            <div className="rv">
              <DetailPanel id="dux" name={t("sections.dux")} section="dux">
                <PanelBody panel={dux.panel} level={3} viz={viz(dux.panel)} />
              </DetailPanel>
            </div>
          )}
        </Beat>
      </TrackedSection>

      <TrackedSection id="projects" className="fl-sec">
        <Beat beat={8} idx="08" at="l" head={<Headline text={t("flow.projects")} label={t("sections.projects")} />}>
          <p className="fl-kick rv" aria-hidden="true">{t("sections.projects")}</p>
          {projects.intro && <p className={`${lede(projects.intro)} rv`}>{projects.intro}</p>}
          {feature && (
            <div id={feature.id} className="fl-feature rv" data-item={0}>
              <h3>{projName(feature)}</h3>
              <p className="fl-p">{feature.blurb}</p>
              {viz(feature.panel)}
              <p className="fl-meta">
                {feature.tech?.join(", ")}
                {feature.repo && <RepoFacts repo={feature.repo} github={github} locale={locale} />}
              </p>
              {feature.panel ? (
                <DetailPanel id={feature.id} name={feature.name} section="projects" actions={<ProjectActions project={feature} primary />}>
                  <PanelBody panel={{ ...feature.panel, viz: undefined }} />
                </DetailPanel>
              ) : (
                <p className="btn-row">
                  <ProjectActions project={feature} primary />
                </p>
              )}
            </div>
          )}
          {/* Dux Player with its plugins and dux-cast: one entry of the form (item 1). */}
          {dux.projects.map((p) => (
            <div key={p.id} id={p.id} className={p === duxLead ? "fl-feature rv" : "fl-entry rv"} data-item={1} data-dux-shared={p.usedBy ? "" : undefined}>
              <h3>
                <a href={p.url}>{p.name}</a>
              </h3>
              <p className="fl-p">{p.blurb}</p>
              {p === duxLead && <DuxBuiltOn locale={locale} />}
              <DuxRelations project={p} projects={dux.projects} locale={locale} />
              <p className="fl-meta">
                <RepoFacts repo={p.repo} github={github} locale={locale} />
              </p>
              {p.images?.length ? <Gallery images={p.images} label={p.name} locale={locale} /> : null}
              {p.panel ? (
                <DetailPanel id={p.id} name={p.name} section="projects" actions={<ActionLink href={p.url}>{t("projects.github")}</ActionLink>}>
                  <PanelBody panel={p.panel} viz={viz(p.panel)} />
                </DetailPanel>
              ) : (
                <p className="btn-row dp-actions">
                  <ActionLink href={p.url}>{t("projects.github")}</ActionLink>
                </p>
              )}
            </div>
          ))}
          {restProjects.map((p, i) => (
            <div key={p.id} id={p.id} className="fl-entry rv" data-item={i + 2}>
              <h3>{projName(p)}</h3>
              <p className="fl-p">{p.blurb}</p>
              <p className="fl-meta">
                {p.tech?.join(", ")}
                {p.repo && <RepoFacts repo={p.repo} github={github} locale={locale} />}
              </p>
              {p.panel ? (
                <DetailPanel id={p.id} name={p.name} section="projects" actions={<ProjectActions project={p} />}>
                  <PanelBody panel={p.panel} viz={viz(p.panel)} />
                </DetailPanel>
              ) : (
                <p className="btn-row dp-actions">
                  <ProjectActions project={p} />
                </p>
              )}
            </div>
          ))}
        </Beat>
      </TrackedSection>

      <TrackedSection id="contact" className="fl-sec">
        <div className="fl-beat fl-contact" data-beat={9}>
          <div className="fl-inner">
            <div className="fl-stage" data-stage="full" />
            <div className="fl-head">
              <Headline text={t("flow.contact")} />
            </div>
            <div className="fl-body">
              <p className="fl-lede rv">{contact.intro}</p>
              <div className="rv">
                <CopyEmail email={contact.email} section="contact" className="fl-mail" />
              </div>
              <ul className="btn-row rv">
                {contact.links.map((l) => (
                  <li key={l.href}>
                    <ActionLink href={l.href}>{l.label}</ActionLink>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </TrackedSection>
    </div>
  );
}
