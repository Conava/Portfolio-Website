"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ExpandableCard } from "@/components/ui/expandable-card";
import { SectionHeading } from "@/components/ui/section-heading";
import { TechBadge } from "@/components/ui/tech-badge";
import type { ExperienceEntry } from "@/lib/types";

export function Experience({ entries, index }: { entries: ExperienceEntry[]; index?: string }) {
  const t = useTranslations("sections");

  return (
    <section className="py-24 px-6 max-w-6xl mx-auto" data-section="experience" data-index={index}>
      <SectionHeading id="experience" index={index}>{t("experience")}</SectionHeading>

      <div className="timeline-list space-y-4">
        {entries.map((entry, i) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            <ExpandableCard
              expandedContent={
                <div className="space-y-4">
                  <ul className="space-y-2">
                    {entry.details.map((detail, j) => (
                      <li
                        key={j}
                        className="text-[var(--color-text-muted)] flex items-start gap-2"
                      >
                        <span className="text-[var(--color-accent)] mt-1 shrink-0">
                          ▸
                        </span>
                        {detail}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    {entry.tech.map((tech) => (
                      <TechBadge key={tech} name={tech} />
                    ))}
                  </div>
                </div>
              }
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">{entry.role}</h3>
                  <p className="text-[var(--color-accent)]">{entry.company}</p>
                </div>
                <div className="text-sm text-[var(--color-text-muted)] text-right">
                  <p>{entry.period}</p>
                  <p>{entry.location}</p>
                </div>
              </div>
              <p className="text-[var(--color-text-muted)] mt-2">
                {entry.summary}
              </p>
            </ExpandableCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
