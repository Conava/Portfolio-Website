import { freshness, type GithubData } from "@/lib/github";
import type { Locale, Viz as VizData } from "@/lib/types";
import { CourseMap } from "./course-map";
import { Funnel } from "./funnel";
import { Pipeline } from "./pipeline";
import { PipelineCompare } from "./pipeline-compare";
import { PrDots } from "./pr-dots";

/**
 * Server component: renders a content `Viz`, or `null` when it has nothing truthful to show
 * (no GitHub data, expired data, no matching PRs).
 */
export async function Viz({ viz, github, locale }: { viz: VizData; github: GithubData | null; locale: Locale }) {
  switch (viz.type) {
    case "funnel":
      return <Funnel steps={viz.steps} caption={viz.caption} locale={locale} />;
    case "pr-dots": {
      if (!github?.org || freshness(github.fetchedAt, new Date()) === "expired") return null;
      const want = viz.repos?.map((r) => r.toLowerCase());
      const prs = github.org.prs.filter((p) => !want || want.includes(p.repo.toLowerCase()));
      return <PrDots prs={prs} fetchedAt={github.fetchedAt} caption={viz.caption} locale={locale} />;
    }
    case "pipeline":
      return <Pipeline stages={viz.stages} hooks={viz.hooks} standalone={viz.standalone} caption={viz.caption} locale={locale} />;
    case "pipeline-compare":
      return <PipelineCompare before={viz.before} after={viz.after} caption={viz.caption} />;
    case "course-map":
      return <CourseMap groups={viz.groups} caption={viz.caption} locale={locale} />;
  }
}
