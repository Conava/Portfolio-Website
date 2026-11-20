export type Locale = "en" | "de";

/** href: absolute URL, mailto:, or a site path like "/resume.pdf" */
export interface Link { label: string; href: string }
/** "YYYY-MM" */
export type YearMonth = string;
export interface Image { src: string; alt: string; width: number; height: number; caption?: string; credit?: Link }
/**
 * id keys the stage's short note (messages `devline.flowShort`). approval: a manual approval gate
 * follows the stage; gate: the stage is itself that gate. skill: the command that runs the stage alone.
 * optional: a conditional branch the run can skip.
 */
export interface PipelineStage {
  id?: string;
  label: string;
  perTask?: boolean;
  approval?: boolean;
  gate?: boolean;
  optional?: boolean;
  skill?: string;
  agents?: PipelineAgent[];
}
/** model: the agent's `model:` frontmatter; kb: the kb-skills it loads. */
export interface PipelineAgent { id: string; model: string; kb?: string[] }
/** Extras around a run: hooks that guard it and commands usable on their own (notes in messages `devline.run`). */
export interface PipelineExtras { hooks?: { id: string }[]; standalone?: { id: string; command: string; agents?: PipelineAgent[] }[] }
export type Viz =
  | { type: "funnel"; caption: string; steps: { label: string; value: number }[] }
  | { type: "pr-dots"; caption: string; repos?: string[] }
  | { type: "pipeline-compare"; caption: string; before: { label: string; stages: string[] }; after: { label: string; stages: string[] } }
  | ({ type: "pipeline"; caption: string; stages: PipelineStage[] } & PipelineExtras)
  | { type: "course-map"; caption: string; groups: { area: string; courses: string[] }[] };
/** did is a short list of what was done; significant is one optional line on why it mattered. */
export interface Panel { did: string[]; significant?: string; viz?: Viz }
export interface AboutContent { name: string; lede: string; statement: string[]; links: Link[] }
/** brief: the clause the hero status line uses while the entry is current or upcoming ("Cloud Software Engineer at Adobe"). */
export interface Job { id: string; brief?: string; company: string; url: string; logo?: Image; role: string; location: string; start: YearMonth; end: YearMonth | null; summary: string; panel?: Panel; figures?: { services?: number; moved?: number; apps?: number } }
export interface WorkContent { intro?: string; jobs: Job[] }
export interface School { id: string; brief?: string; name: string; url: string; logo: Image; degree: string; field: string; start: YearMonth; end: YearMonth | null; status: "completed" | "in-progress" | "upcoming"; note?: string; gpa?: { value: string; scale: string }; panel?: Panel }
export interface EducationContent { intro?: string; schools: School[] }
export interface BpmnscriptContent { intro: string; repo: string; sample: string; proof: { sentence: string; steps: { label: string; value: number }[] }; links: Link[]; panel?: Panel }
/** title is the fallback when GitHub data is missing; note is an optional plain-language description; image: a screenshot of the feature, shown small beside the blurb */
export interface FeaturedPr { ref: string; label?: string; title: string; note?: string; blurb: string; image?: Image }
/** usedBy: ids of the projects that build on this one (dux-cast: the player and the plugins). */
export interface DuxProject { id: string; usedBy?: string[]; name: string; repo: string; url: string; blurb: string; images?: Image[]; panel?: Panel }
/** shellImages: the first one whose file exists leads the section (overview.webp once it is added). */
export interface DuxContent { intro: string; shellRepo: string; featuredPrs: FeaturedPr[]; shellImages?: Image[]; projects: DuxProject[]; links: Link[]; panel?: Panel }
export interface Project { id: string; name: string; blurb: string; slug?: string; repo?: string; url?: string; emphasis?: boolean; tech?: string[]; panel?: Panel }
export interface ProjectsContent { intro?: string; projects: Project[] }
/** email is per locale (EN contact@, DE kontakt@) */
export interface ContactContent { intro: string; email: string; links: Link[] }
export interface HomeContent { about: AboutContent; work: WorkContent; education: EducationContent; bpmnscript: BpmnscriptContent; dux: DuxContent; projects: ProjectsContent; contact: ContactContent }

export interface ProjectFrontmatter {
  title: string;
  date: string;
  summary: string;
  tech: string[];
  githubUrl?: string;
  thumbnail?: string;
  featured?: boolean;
  fullWidth?: boolean;
  hidden?: boolean;
  hideFromPortfolio?: boolean;
  status?: "active" | "completed" | "in-progress" | "discontinued" | "upcoming";
}

export type ArticleSlug = "bpmnscript" | "dux" | "devline";
export interface ArticleSection { id: string; title: string }
export interface ArticleFigure extends Image { id: string; plate?: boolean }        // plate: thesis figures on the light plate
export interface ArticleMeta {
  title: string; description: string /* meta + OG, <= 160 chars */; lede: string;
  published: string; updated: string /* YYYY-MM-DD */;
  ogImage: Image /* 1200x630 */; sections: ArticleSection[]; links: Link[];
}
export interface ArticleBase { meta: ArticleMeta; figures: ArticleFigure[]; numbers?: { id: string; value: number }[] }
export interface BpmnscriptArticle extends ArticleBase { repo: string; funnel: { label: string; value: number }[] }
export interface DuxContribution { id: string; title: string; summary: string; prs: { ref: string; title: string; note?: string }[]; images?: Image[] }  // pr title = fallback, note = plain-language description
export interface DuxArticle extends ArticleBase { contributions: DuxContribution[]; projects: { id: string /* = dux.json projects[].id */; summary: string[] }[] }
export interface DevlineArticle extends ArticleBase {
  repo: string;
  stages: { id: string; label: string; summary: string; agents: string[] /* agent ids */; parallel?: number; approval?: boolean }[];
  agents: { id: string; role: string; model?: string }[];          // id = file name in agents/ (fact)
  skills: { id: string; summary: string; group?: string }[];       // id = folder name in skills/
  hooks: { id: string; event: string; summary: string }[];         // id = script name, event = PreToolUse etc.
  install: { label: string; command: string }[];
}
export interface ArticleMap { bpmnscript: BpmnscriptArticle; dux: DuxArticle; devline: DevlineArticle }
