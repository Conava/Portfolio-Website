"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/ui/section-heading";
import { Link } from "@/i18n/navigation";
import type { EducationEntry } from "@/lib/types";


function EducationCard({
  entry,
  index,
}: {
  entry: EducationEntry;
  index: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [thesisExpanded, setThesisExpanded] = useState(false);
  const t = useTranslations("common");

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        layout
        className="theme-card expandable-card rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 cursor-pointer hover:bg-[var(--color-bg-card-hover)] transition-colors"
        onClick={() => {
          if (window.getSelection()?.toString()) return;
          setIsExpanded(!isExpanded);
        }}
      >
        <motion.div layout="position">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold">
                {entry.degree} {entry.field}
              </h3>
              <p className="text-[var(--color-accent)]">{entry.institution}</p>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              {entry.period}
            </p>
          </div>
          <p className="text-[var(--color-text-muted)] mt-2">{entry.summary}</p>
        </motion.div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="pt-4 border-t border-[var(--color-border)] mt-4 space-y-3">
                {entry.details.map((detail, j) => (
                  <p
                    key={j}
                    className="text-[var(--color-text-muted)] flex items-start gap-2"
                  >
                    <span className="text-[var(--color-accent)] mt-1">▸</span>
                    {detail}
                  </p>
                ))}

                {/* Nested thesis entry */}
                {entry.thesis && (
                  <div
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-4 mt-4 cursor-pointer hover:bg-[var(--color-bg-card-hover)] transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.getSelection()?.toString()) return;
                      setThesisExpanded(!thesisExpanded);
                    }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[var(--color-accent)]">
                        📄 Thesis
                      </span>
                      <h4 className="font-medium">{entry.thesis.title}</h4>
                    </div>

                    <AnimatePresence>
                      {thesisExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <p className="text-[var(--color-text-muted)] mt-2 text-sm">
                            {entry.thesis.summary}
                          </p>
                          <div className="flex gap-3 mt-3 flex-wrap">
                            <Link
                              href={`/projects/${entry.thesis.projectSlug}`}
                              className="theme-btn-primary text-sm px-4 py-1.5 rounded-full bg-[var(--color-accent)] text-[var(--color-bg)] hover:bg-[var(--color-accent-hover)] transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {t("view_project")}
                            </Link>
                            <a
                              href={entry.thesis.githubUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm px-4 py-1.5 rounded-full border border-[var(--color-border)] hover:bg-[var(--color-bg-card-hover)] transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {t("github")}
                            </a>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <p className="text-xs text-[var(--color-text-muted)] mt-2">
                      {thesisExpanded ? t("collapse") : t("read_more")}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.p
          layout="position"
          className="text-xs text-[var(--color-text-muted)] mt-3"
        >
          {isExpanded ? t("collapse") : t("read_more")}
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

export function Education({ entries, index }: { entries: EducationEntry[]; index?: string }) {
  const t = useTranslations("sections");

  return (
    <section className="py-24 px-6 max-w-6xl mx-auto" data-section="education" data-index={index}>
      <SectionHeading id="education" index={index}>{t("education")}</SectionHeading>
      <div className="timeline-list space-y-4">
        {entries.map((entry, i) => (
          <EducationCard key={entry.id} entry={entry} index={i} />
        ))}
      </div>
    </section>
  );
}
