"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/ui/section-heading";
import { ExpandableCard } from "@/components/ui/expandable-card";
import { Link } from "@/i18n/navigation";
import type { PublicationEntry } from "@/lib/types";

function PublicationCard({
  entry,
  index,
}: {
  entry: PublicationEntry;
  index: number;
}) {
  const t = useTranslations("common");

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.6, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
    >
      <ExpandableCard
        expandedContent={
          <div className="space-y-3">
            {(entry.year || entry.venue || entry.authors) && (
              <div className="text-sm text-[var(--color-text-muted)] space-y-1">
                {entry.year && <p>{entry.year}</p>}
                {entry.venue && (
                  <p className="text-[var(--color-accent)]">{entry.venue}</p>
                )}
                {entry.authors && <p>{entry.authors.join(", ")}</p>}
              </div>
            )}
            <div className="flex gap-3 flex-wrap">
              {entry.projectSlug && (
                <Link
                  href={`/projects/${entry.projectSlug}`}
                  className="theme-btn-primary text-sm px-4 py-1.5 rounded-full bg-[var(--color-accent)] text-[var(--color-bg)] hover:bg-[var(--color-accent-hover)] transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("view_project")}
                </Link>
              )}
              <a
                href={entry.publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm px-4 py-1.5 rounded-full border border-[var(--color-border)] hover:bg-[var(--color-bg-card-hover)] transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {t("view_publication")}
              </a>
              {entry.pdfUrl && (
                <a
                  href={entry.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="text-sm px-4 py-1.5 rounded-full border border-[var(--color-border)] hover:bg-[var(--color-bg-card-hover)] transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("download_pdf")}
                </a>
              )}
            </div>
          </div>
        }
      >
        <h3 className="text-lg font-semibold">{entry.title}</h3>
        <p className="text-[var(--color-text-muted)] mt-2 text-sm">
          {entry.description}
        </p>
      </ExpandableCard>
    </motion.div>
  );
}

export function Publications({
  entries,
  index,
}: {
  entries: PublicationEntry[];
  index?: string;
}) {
  const t = useTranslations("sections");

  return (
    <section
      className="py-24 px-6 max-w-6xl mx-auto"
      data-section="publications"
      data-index={index}
    >
      <SectionHeading id="publications" index={index}>
        {t("publications")}
      </SectionHeading>
      <div className="space-y-4">
        {entries.map((entry, i) => (
          <PublicationCard key={entry.id} entry={entry} index={i} />
        ))}
      </div>
    </section>
  );
}
