import Image from "next/image";
import { Fragment, type CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { ActionLink, ProjectActions } from "@/components/shared/action-link";
import { CopyEmail } from "@/components/shared/copy-email";
import { Gallery } from "@/components/shared/gallery";
import { DuxCounts } from "@/components/shared/github/dux-counts";
import { PrList } from "@/components/shared/github/pr-list";
import { RepoFacts } from "@/components/shared/github/repo-facts";
import { DownloadIcon } from "@/components/shared/icons";
import { LogoPlate } from "@/components/shared/logo-plate";
import { StatusLine } from "@/components/shared/status-line";
import { DetailPanel } from "@/components/shared/panel/detail-panel";
import { PanelBody } from "@/components/shared/panel/panel-body";
import { jobEntries, monthIndex, schoolEntries, Timeline, timelineRange } from "@/components/shared/viz/timeline";
import { Viz } from "@/components/shared/viz/viz";
import { DuxRelations } from "@/components/shared/dux-relations";
import { Link } from "@/i18n/navigation";
import { formatMonth, formatRange } from "@/lib/format";
import type { Project, YearMonth } from "@/lib/types";
import { TypeBpmnscript } from "./bpmnscript";
import { Facade, FarWall, Room, RoomTag, type Ground } from "./room";
import { TypeStage } from "./stage";
import { TY_MODE_SCRIPT } from "./mode-script";
import "./type-home.css";

const other = (g: Ground): Ground => (g === "paper" ? "alt" : "paper");
/** Flight lengths in viewports, in page order: a long first flight, then short and long ones mixed so no two rooms in a row feel the same. */
const FLY = [0.9, 0.75, 0.5, 0.75, 0.5, 0.55, 0.7];

/**
 * The Type homepage: seven rooms. Each section's name stands as a facade word; the camera
 * flies through a counter of the word into the section behind it. Grounds alternate, so a
 * counter always opens onto the other ground, and each facade stands on the ground of the
 * interior before it. Each room carries a running label and, at its far end, the faint word
 * of the next wall. The page ends on the name again.
 */
export async function TypeHome(props: SectionProps) {
  const { content, github, locale, today } = props;
  const t = await getTranslations();
  const { about, work, education, bpmnscript, dux, projects, contact } =
    content;
  const sec = (k: string) => t(`sections.${k}`);
  const viz = (v: Parameters<typeof Viz>[0]["viz"] | undefined) =>
    v && <Viz viz={v} github={github} locale={locale} />;

  // Interior grounds in page order; facade i stands on the other one.
  const g: Ground[] = ["alt", "paper", "alt", "paper", "alt", "paper", "alt"];
  const room = (
    i: number,
    id: string,
    word: string,
    labels: string[],
    body: React.ReactNode,
    aside?: React.ReactNode,
  ) => (
    <Room
      key={id}
      id={id}
      ground={g[i]}
      rest={i === 6}
      fly={FLY[i]}
      facade={
        <Facade
          word={word}
          as={i === 0 ? "h1" : "h2"}
          ground={other(g[i])}
          labels={labels}
        >
          {aside}
        </Facade>
      }
      interior={body}
    />
  );

  const words = [
    about.name,
    ...["work", "education", "bpmnscript", "dux", "projects", "contact"].map(sec),
  ];
  const tag = (i: number) => <RoomTag n={i} name={words[i]} />;
  const far = (i: number) => <FarWall word={words[i + 1]} />;

  // One axis for the timeline and the job bars below it: the bars are its work rows taken apart.
  const lanes = [
    { label: sec("work"), entries: jobEntries(work, education) },
    { label: sec("education"), entries: schoolEntries(education) },
  ];
  const { d0, d1 } = timelineRange(lanes.flatMap((l) => l.entries), today);
  const at = (m: number) => ((m - d0) / (d1 - d0)) * 100;
  const years = Array.from({ length: Math.ceil(d1 / 12) - Math.ceil(d0 / 12) }, (_, k) => {
    const m = (Math.ceil(d0 / 12) + k) * 12;
    return { key: m, at: `${at(m).toFixed(2)}%` };
  }).filter((y) => y.key > d0);
  const span = (start: YearMonth, end: YearMonth | null) => {
    const l = at(monthIndex(start));
    const r = 100 - at(Math.min(monthIndex(end ?? today), d1 - 1) + 1);
    const w = (100 - l - r) / 100;
    return {
      "--l": `${l.toFixed(2)}%`,
      "--r": `${r.toFixed(2)}%`,
      // The panel opens out of its bar: scaled to the bar's width about the point that maps onto it.
      "--sx": w.toFixed(4),
      "--ox": `${w < 0.999 ? (l / (1 - w)).toFixed(2) : 0}%`,
    } as CSSProperties;
  };

  const duxCounts = await DuxCounts({ github, locale });
  const shot = dux.shellImages?.[0];
  const feature = projects.projects.find((p) => p.emphasis);
  const rest = projects.projects.filter((p) => p !== feature);
  const projectName = (p: Project) =>
    p.slug ? (
      <Link href={`/projects/${p.slug}?from=home`}>{p.name}</Link>
    ) : p.url?.startsWith("/") ? (
      <Link href={p.url}>{p.name}</Link>
    ) : p.url ? (
      <a href={p.url}>{p.name}</a>
    ) : (
      p.name
    );

  return (
    <div className="ty-home">
      <script dangerouslySetInnerHTML={{ __html: TY_MODE_SCRIPT }} />

      {room(
        0,
        "top",
        about.name,
        [
          "about",
          "work",
          "education",
          "bpmnscript",
          "dux",
          "projects",
          "contact",
        ].map(sec),
        <TrackedSection
          id="about"
          className="ty-in"
          data-ground={g[0]}
          data-ty-in
        >
          <div className="ty-wrap">
            <h2 className="ty-h" data-ty-focus>
              {sec("about")}
            </h2>
            <div className="ty-statement">
              {about.statement.map((s) => (
                <p key={s}>{s}</p>
              ))}
            </div>
            <ul className="btn-row ty-links">
              {about.links.map((l) => (
                <li key={l.href}>
                  <ActionLink href={l.href}>{l.label}</ActionLink>
                </li>
              ))}
            </ul>
          </div>
          {far(0)}
        </TrackedSection>,
        <div className="ty-below">
          <div>
            <p className="ty-lede">{about.lede}</p>
            <StatusLine content={content} locale={locale} today={today} className="ty-status" />
          </div>
          <p className="btn-row ty-cta">
            <a className="btn btn-primary" href="/resume.pdf">
              <DownloadIcon />
              {t("hero.resume")}
            </a>
            <a className="btn" href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
          </p>
        </div>,
      )}

      {room(
        1,
        "work",
        sec("work"),
        work.jobs.map((j) => j.company),
        <div className="ty-in" data-ground={g[1]} data-ty-in>
          {tag(1)}
          <div className="ty-wrap">
            {work.intro && <p className="ty-lede">{work.intro}</p>}
            <div className="ty-timeline">
              <Timeline groups={lanes} caption={t("viz.timeline")} locale={locale} today={today} />
            </div>
            {/* The timeline's work rows taken apart: each job keeps its bar on the same axis, and the
                bar widens into the job's panel as it scrolls in. */}
            <ul className="ty-jobs">
              {work.jobs.map((j, i) => (
                <li
                  key={j.id}
                  id={j.id}
                  className="ty-job"
                  style={span(j.start, j.end)}
                  data-ty-focus={i === 0 ? "" : undefined}
                >
                  <div className="ty-axis" aria-hidden="true">
                    {years.map((y) => (
                      <span key={y.key} style={{ left: y.at }} />
                    ))}
                    <i />
                  </div>
                  <div className="ty-job-panel" data-ground="ink">
                    <div className="ty-row-id">
                      <h3 className={j.logo ? "ty-logo" : undefined}>
                        <a href={j.url} data-track-label={j.company}>
                          {j.logo ? (
                            <LogoPlate image={j.logo} size="md" />
                          ) : (
                            j.company
                          )}
                        </a>
                      </h3>
                      <p className="ty-meta">
                        {formatRange(j.start, j.end, locale, t("date.present"))},{" "}
                        {j.location}
                      </p>
                    </div>
                    <div className="ty-row-body">
                      <p className="ty-role">{j.role}</p>
                      <p className="ty-prose">{j.summary}</p>
                      {j.panel && (
                        <DetailPanel id={j.id} name={j.company} section="work">
                          <PanelBody
                            panel={j.panel}
                            viz={viz(j.panel.viz)}
                          />
                        </DetailPanel>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {far(1)}
        </div>,
      )}

      {room(
        2,
        "education",
        sec("education"),
        education.schools.map((s) => s.name),
        <div className="ty-in" data-ground={g[2]} data-ty-in>
          {tag(2)}
          <div className="ty-wrap">
            {education.intro && <p className="ty-lede">{education.intro}</p>}
            <ul className="ty-rows">
              {education.schools.map((s, i) => (
                <li
                  key={s.id}
                  id={s.id}
                  className="ty-row"
                  data-ty-focus={i === 0 ? "" : undefined}
                >
                  <div className="ty-row-id">
                    {/* The start year as scenery; the dates are in the line below the plate. */}
                    <span className="ty-year" aria-hidden="true">
                      {s.start.slice(0, 4)}
                    </span>
                    <div className="ty-plate">
                      <LogoPlate image={s.logo} size="box" />
                    </div>
                    <p className="ty-meta">
                      {s.status === "upcoming"
                        ? t("dates.from", {
                            date: formatMonth(s.start, locale),
                          })
                        : formatRange(
                            s.start,
                            s.end,
                            locale,
                            t("date.present"),
                          )}
                    </p>
                  </div>
                  <div className="ty-row-body">
                    <h3>
                      <a href={s.url}>{s.name}</a>
                    </h3>
                    <p className="ty-role">
                      {s.degree}, {s.field}
                    </p>
                    {s.gpa && (
                      <p className="ty-prose num">
                        {t("education.gpa", s.gpa)}
                      </p>
                    )}
                    {s.note && <p className="ty-prose">{s.note}</p>}
                    {s.panel && (
                      <DetailPanel id={s.id} name={s.name} section="education">
                        <PanelBody panel={s.panel} viz={viz(s.panel.viz)} />
                      </DetailPanel>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {far(2)}
        </div>,
      )}

      {room(
        3,
        "bpmnscript",
        sec("bpmnscript"),
        bpmnscript.links.map((l) => l.label),
        <TypeBpmnscript
          content={content}
          locale={locale}
          ground={g[3]}
          tag={tag(3)}
          far={far(3)}
        />,
      )}

      {room(
        4,
        "dux",
        sec("dux"),
        dux.featuredPrs.flatMap((f) => f.label ?? []),
        <div className="ty-in" data-ground={g[4]} data-ty-in>
          {tag(4)}
          <div className="ty-wrap">
            <p className="ty-lede ty-wide" data-ty-focus>
              {dux.intro}
              {duxCounts && <> {duxCounts}.</>}
            </p>
            <ul className="btn-row ty-links">
              {dux.links.map((l) => (
                <li key={l.href}>
                  <ActionLink href={l.href} primary={l.href === "/dux"}>
                    {l.label}
                  </ActionLink>
                </li>
              ))}
            </ul>
            {/* The contributions as a popout of the shell, hanging from its tab. */}
            <div className="ty-pops" data-ground="ink">
              <article id="dux-shell" className="ty-pop">
                <h3 className="ty-pop-tab">{t("dux.contributions")}</h3>
                <div className="ty-pop-body">
                <div className="ty-row-id">
                  <p className="ty-meta">
                    <RepoFacts
                      repo={dux.shellRepo}
                      github={github}
                      locale={locale}
                    />
                  </p>
                  {shot && (
                    <figure className="ty-shot">
                      <Image
                        src={shot.src}
                        alt={shot.alt}
                        width={shot.width}
                        height={shot.height}
                        sizes="(min-width: 1080px) 560px, 92vw"
                      />
                      {shot.caption && (
                        <figcaption className="ty-meta">
                          {shot.caption}
                        </figcaption>
                      )}
                    </figure>
                  )}
                </div>
                <div className="ty-row-body ty-prs">
                  <PrList
                    featured={dux.featuredPrs}
                    github={github}
                    locale={locale}
                  />
                </div>
                </div>
              </article>
            </div>
            {dux.panel && (
              <DetailPanel id="dux" name={sec("dux")} section="dux">
                <PanelBody
                  panel={dux.panel}
                  level={3}
                  viz={viz(dux.panel.viz)}
                />
              </DetailPanel>
            )}
          </div>
          {far(4)}
        </div>,
      )}

      {room(
        5,
        "projects",
        sec("projects"),
        [...(feature ? [feature] : []), ...dux.projects, ...rest].map((p) => p.name),
        <div className="ty-in" data-ground={g[5]} data-ty-in>
          {tag(5)}
          <div className="ty-wrap">
            {projects.intro && <p className="ty-lede">{projects.intro}</p>}
            <ul className="ty-rows">
              {[...(feature ? [feature] : []), ...rest].map((p, i) => (
                <Fragment key={p.id}>
                <li
                  id={p.id}
                  className="ty-row"
                  data-ty-focus={i === 0 ? "" : undefined}
                  data-feature={p === feature ? "" : undefined}
                >
                  <div className="ty-row-id">
                    <h3>{projectName(p)}</h3>
                    <p className="ty-meta">
                      {p.tech?.join(", ")}
                      {p.repo && (
                        <>
                          {" "}
                          <RepoFacts
                            repo={p.repo}
                            github={github}
                            locale={locale}
                          />
                        </>
                      )}
                    </p>
                  </div>
                  <div className="ty-row-body">
                    <p className="ty-prose">{p.blurb}</p>
                    {p === feature &&
                      p.panel?.did.map((d, k) => (
                        <p key={k} className="ty-prose">
                          {d}
                        </p>
                      ))}
                    {p.panel && p !== feature ? (
                      <DetailPanel
                        id={p.id}
                        name={p.name}
                        section="projects"
                        actions={<ProjectActions project={p} />}
                      >
                        <PanelBody panel={p.panel} viz={viz(p.panel.viz)} />
                      </DetailPanel>
                    ) : (
                      <p className="btn-row dp-actions">
                        <ProjectActions project={p} primary={p === feature} />
                      </p>
                    )}
                  </div>
                  {/* The devline run needs the whole row: it pins and steps through its stages. */}
                  {p === feature && <div className="ty-row-run">{viz(p.panel?.viz)}</div>}
                </li>
                {p === feature && dux.projects.length > 0 && (
                  <li className="ty-row ty-row-dux">
                    {/* Dux Player, the plugins and dux-cast: a Dux bar, each project a popout
                        hanging from its own tab. */}
                    <div className="ty-pops" data-ground="ink">
                      <nav className="ty-bar" aria-label="Dux">
                        <span className="ty-bar-name" aria-hidden="true">Dux</span>
                        <ul>
                          {dux.projects.map((d) => (
                            <li key={d.id}>
                              <a href={`#${d.id}`}>{d.name}</a>
                            </li>
                          ))}
                        </ul>
                      </nav>
                      {dux.projects.map((d, k) => (
                        <article
                          key={d.id}
                          id={d.id}
                          className="ty-pop"
                          data-dux-shared={d.usedBy ? "" : undefined}
                        >
                          <h3 className="ty-pop-tab">
                            <a href={d.url}>{d.name}</a>
                          </h3>
                          <div className="ty-pop-body">
                            <div className="ty-row-id">
                              <p className="ty-meta">
                                <RepoFacts
                                  repo={d.repo}
                                  github={github}
                                  locale={locale}
                                />
                              </p>
                              <p className="ty-prose">{d.blurb}</p>
                              <DuxRelations project={d} projects={dux.projects} locale={locale} />
                              {d.panel ? (
                                <DetailPanel id={d.id} name={d.name} section="projects" actions={<ActionLink href={d.url}>{t("projects.github")}</ActionLink>}>
                                  <PanelBody panel={d.panel} />
                                </DetailPanel>
                              ) : (
                                <p className="btn-row">
                                  <ActionLink href={d.url}>
                                    {t("projects.github")}
                                  </ActionLink>
                                </p>
                              )}
                            </div>
                            {d.images?.length ? (
                              <div className="ty-row-body">
                                <Gallery
                                  images={d.images}
                                  label={d.name}
                                  locale={locale}
                                />
                              </div>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </li>
                )}
                </Fragment>
              ))}
            </ul>
          </div>
          {far(5)}
        </div>,
      )}

      {room(
        6,
        "contact",
        sec("contact"),
        contact.links.map((l) => l.label),
        <div className="ty-in" data-ground={g[6]} data-ty-in>
          {tag(6)}
          <div className="ty-wrap ty-contact">
            <p className="ty-lede" data-ty-focus>
              {contact.intro}
            </p>
            <CopyEmail
              email={contact.email}
              section="contact"
              className="ty-ce"
            />
            <ul className="btn-row ty-links">
              {contact.links.map((l) => (
                <li key={l.href}>
                  <ActionLink href={l.href}>{l.label}</ActionLink>
                </li>
              ))}
            </ul>
          </div>
          {/* The bookend: the page ends on the name it opened with, under the card. */}
          <div className="ty-end">
            <Facade word={about.name} as="p" ground={g[6]} />
          </div>
        </div>,
      )}

      <TypeStage />
    </div>
  );
}
