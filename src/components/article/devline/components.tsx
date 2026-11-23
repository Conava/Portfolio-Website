import { Fragment, type CSSProperties } from "react";
import type { MDXComponents } from "mdx/types";
import { getTranslations } from "next-intl/server";
import { RevealOnce } from "@/components/shared/reveal-once";
import { freshness, type GithubData } from "@/lib/github";
import { formatNumber } from "@/lib/format";
import { softwareSourceCodeJsonLd } from "@/lib/seo";
import type { DevlineArticle, HomeContent } from "@/lib/types";
import { articleContext } from "../mdx-article";
import "./devline.css";

const ctx = () => articleContext<"devline">();
const t = () => getTranslations({ locale: ctx().locale, namespace: "devline" });

/** The latest release tag without its `devline--` prefix; null without fresh GitHub data. */
function version(github: GithubData | null, data: DevlineArticle): string | null {
  const info = github?.repos[data.repo.toLowerCase()];
  if (!github || !info?.latestRelease || freshness(github.fetchedAt, new Date()) === "expired") return null;
  return info.latestRelease.tag.replace(/^devline--/, "");
}

/** "7 agents, 19 skills, 4 hooks", counted from the data. */
async function DevlineCounts() {
  const { data, locale } = ctx();
  const n = (x: unknown[]) => formatNumber(x.length, locale);
  return <p className="meta dl-facts">{(await t())("counts", { agents: n(data.agents), skills: n(data.skills), hooks: n(data.hooks) })}</p>;
}

/** "Current release: v0.4.4" from GitHub; nothing when the tag is unknown. */
async function DevlineVersion() {
  const { github, data } = ctx();
  const tag = version(github, data);
  return tag ? <p className="meta dl-facts">{(await t())("version", { tag })}</p> : null;
}

/**
 * The run as a vertical rail: one node per stage, a diamond where a person approves, and under
 * "implement" the fan-out (one lane per task, however many the plan has) with the fix loop.
 * Static HTML/CSS; the text alternative is the sr-only sentence, the drawing is aria-hidden.
 */
async function DevlinePipeline() {
  const { data } = ctx();
  const tr = await t();
  const short = tr.raw("flowShort") as Record<string, string>;
  const lanes = [tr("flowTask", { n: 1 }), tr("flowTask", { n: 2 }), "\u2026", tr("flowTaskN")];
  return (
    <RevealOnce className="pj-fig dl-pipe" threshold={0.3}>
      <figure className="dl-flow">
        <p className="dl-sr">{tr("flowAlt")}</p>
        <ol className="dl-rail" aria-hidden="true">
          {data.stages.map((s) => (
            <li key={s.id} className={s.approval ? "dl-gate" : undefined}>
              <span className="dl-node" />
              <span className="dl-name">{s.label}</span>
              <span className="dl-what">{short[s.id] ?? ""}</span>
              {s.approval && <span className="dl-tag dl-appr">{tr("flowGate")}</span>}
              {s.id === "implement" && (
                <div className="dl-fan">
                  <p className="dl-each">{tr("flowEach")}</p>
                  <div className="dl-heads">
                    <span>{tr("flowImpl")}</span>
                    <span>{tr("flowRev")}</span>
                  </div>
                  {lanes.map((l, i) => (
                    <div key={i} className={`dl-lane${l === "\u2026" ? " dl-more" : ""}`} style={{ "--i": i } as CSSProperties}>
                      <span className="dl-pill">{l}</span>
                      <span className="dl-link" />
                      <span className="dl-pill">{l === "\u2026" ? l : tr("flowRev")}</span>
                    </div>
                  ))}
                  <p className="dl-loop">
                    <span aria-hidden="true">{"\u21ba "}</span>
                    {tr("flowLoop")}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ol>
        <figcaption>{tr("flowCaption")}</figcaption>
      </figure>
    </RevealOnce>
  );
}

const AgentNames = ({ ids }: { ids: string[] }) =>
  ids.map((id, i) => (
    <span key={id}>
      {i > 0 && ", "}
      <code>{id}</code>
    </span>
  ));

/** What each stage does, who runs it and where a person approves. */
async function StageList() {
  const tr = await t();
  return (
    <dl className="dl-list">
      {ctx().data.stages.map((s) => (
        <div key={s.id}>
          <dt>
            {s.label}
            {s.approval && <span className="dl-tag">{tr("approval")}</span>}
          </dt>
          <dd>
            {s.summary}
            {s.agents.length > 0 && (
              <span className="dl-sub">
                {tr("agents")}: <AgentNames ids={s.agents} />
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

async function AgentList() {
  const tr = await t();
  return (
    <dl className="dl-list">
      {ctx().data.agents.map((a) => (
        <div key={a.id}>
          <dt>
            <code>{a.id}</code>
            {a.model && <span className="dl-tag">{tr("model", { model: a.model })}</span>}
          </dt>
          <dd>{a.role}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Skills under their group headings, in data order. */
function SkillList() {
  const groups = new Map<string, DevlineArticle["skills"]>();
  for (const s of ctx().data.skills) groups.set(s.group ?? "", [...(groups.get(s.group ?? "") ?? []), s]);
  return [...groups].map(([group, skills]) => (
    <Fragment key={group}>
      {group && <h3>{group}</h3>}
      <dl className="dl-list">
        {skills.map((s) => (
          <div key={s.id}>
            <dt>
              <code>{s.id}</code>
            </dt>
            <dd>{s.summary}</dd>
          </div>
        ))}
      </dl>
    </Fragment>
  ));
}

function HookList() {
  return (
    <dl className="dl-list">
      {ctx().data.hooks.map((h) => (
        <div key={h.id}>
          <dt>
            <code>{h.id}</code>
            <span className="dl-tag">{h.event}</span>
          </dt>
          <dd>{h.summary}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Install commands as selectable text (the site has no generic copy button). */
function Install() {
  return ctx().data.install.map((i) => (
    <Fragment key={i.label}>
      <p className="dl-install">{i.label}</p>
      <pre>
        <code>{i.command}</code>
      </pre>
    </Fragment>
  ));
}

export const components: MDXComponents = {
  DevlineCounts,
  DevlineVersion,
  DevlinePipeline,
  StageList,
  AgentList,
  SkillList,
  HookList,
  Install,
};

/** SoftwareSourceCode next to the TechArticle; the version only when GitHub supplied it. */
export function jsonLd(data: DevlineArticle, _home: HomeContent, github: GithubData | null) {
  return softwareSourceCodeJsonLd({
    name: "devline",
    description: data.meta.description,
    codeRepository: `https://github.com/${data.repo}`,
    license: "https://spdx.org/licenses/MIT.html",
    programmingLanguage: "Shell",
    version: version(github, data) ?? undefined,
  });
}
