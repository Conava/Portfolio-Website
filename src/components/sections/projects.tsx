"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/ui/section-heading";
import { TechBadge } from "@/components/ui/tech-badge";
import { Link } from "@/i18n/navigation";
import type { ProjectFrontmatter } from "@/lib/types";
import { trackEvent } from "@/lib/analytics";

interface ProjectCardData extends ProjectFrontmatter {
  slug: string;
}

function ProjectStatusBadge({ status }: { status: NonNullable<ProjectFrontmatter["status"]> }) {
  const t = useTranslations("common");

  const colors: Record<NonNullable<ProjectFrontmatter["status"]>, string> = {
    active: "bg-green-500/10 text-green-400 border-green-500/20",
    completed: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    "in-progress": "bg-blue-500/10 text-blue-400 border-blue-500/20",
    discontinued: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    upcoming: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };

  const labelKeys: Record<NonNullable<ProjectFrontmatter["status"]>, "status_active" | "status_completed" | "status_in_progress" | "status_discontinued" | "status_upcoming"> = {
    active: "status_active",
    completed: "status_completed",
    "in-progress": "status_in_progress",
    discontinued: "status_discontinued",
    upcoming: "status_upcoming",
  };

  return (
    <span className={`px-2 py-0.5 text-xs rounded-full border ${colors[status]}`}>
      {t(labelKeys[status])}
    </span>
  );
}

function ProjectCard({
  project,
  index,
  fromOverview,
}: {
  project: ProjectCardData;
  index: number;
  fromOverview?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations("common");

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.6, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className={project.fullWidth ? "md:col-span-2" : ""}
    >
      <motion.div
        layout
        className="expandable-card border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 cursor-pointer flex flex-col transition-colors hover:bg-[var(--color-bg-card-hover)]"
        onClick={() => {
          if (!expanded) trackEvent("project-expand", { slug: project.slug });
          setExpanded(!expanded);
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold mb-1">{project.title}</h3>
            <p className="text-sm text-[var(--color-text-muted)]">
              {project.date}
            </p>
          </div>
          {project.status && (
            <span className="shrink-0 mt-1">
              <ProjectStatusBadge status={project.status} />
            </span>
          )}
        </div>

        <p className="text-[var(--color-text-muted)] mt-3 flex-1">
          {project.summary}
        </p>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="pt-4 border-t border-[var(--color-border)] mt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {project.tech.map((tech) => (
                    <TechBadge key={tech} name={tech} />
                  ))}
                </div>
                <div className="flex gap-3 flex-wrap">
                  <Link
                    href={`/projects/${project.slug}?from=${fromOverview ? "overview" : "home"}`}
                    className="theme-btn-primary text-sm px-4 py-1.5 rounded-full bg-[var(--color-accent)] text-[var(--color-bg)] hover:bg-[var(--color-accent-hover)] transition-colors"
                    onClick={(e) => { e.stopPropagation(); trackEvent("project-view", { slug: project.slug }); }}
                  >
                    {t("view_project")}
                  </Link>
                  {project.githubUrl && (
                    <a
                      href={project.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-full border border-[var(--color-border)] hover:bg-[var(--color-bg-card-hover)] hover:border-[var(--color-accent)] transition-colors"
                      onClick={(e) => { e.stopPropagation(); trackEvent("project-github", { slug: project.slug }); }}
                    >
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current shrink-0" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                      {t("github")}
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.p layout="position" className="text-xs text-[var(--color-text-muted)] mt-3">
          {expanded ? t("collapse") : t("read_more")}
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

export function Projects({
  projects,
  index,
  isStandalonePage = false,
}: {
  projects: ProjectCardData[];
  index?: string;
  isStandalonePage?: boolean;
}) {
  const t = useTranslations("sections");
  const tc = useTranslations("common");

  return (
    <section className="py-24 px-6 max-w-6xl mx-auto" data-section="projects" data-index={index}>
      <div className="relative">
        <SectionHeading id="projects" index={index}>
          {isStandalonePage ? t("all_projects") : t("projects")}
        </SectionHeading>
        {!isStandalonePage && (
          <Link
            href="/projects"
            className="hidden md:inline-block absolute right-0 top-0 text-sm px-4 py-1.5 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-card-hover)] transition-colors"
            onClick={() => trackEvent("see-all-projects", { placement: "header" })}
          >
            {tc("see_all_projects")} →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {projects.map((project, i) => (
          <ProjectCard key={project.slug} project={project} index={i} fromOverview={isStandalonePage} />
        ))}
      </div>
      {!isStandalonePage && (
        <div className="mt-10 flex justify-center">
          <Link
            href="/projects"
            className="text-sm px-6 py-2.5 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-card-hover)] transition-colors"
            onClick={() => trackEvent("see-all-projects", { placement: "bottom" })}
          >
            {tc("see_all_projects")} →
          </Link>
        </div>
      )}
    </section>
  );
}
