"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ExpandableCard } from "@/components/ui/expandable-card";
import { SectionHeading } from "@/components/ui/section-heading";
import type { CertificateEntry } from "@/lib/types";

export function Certificates({ entries, index }: { entries: CertificateEntry[]; index?: string }) {
  const t = useTranslations("sections");
  const tc = useTranslations("common");

  return (
    <section className="py-24 px-6 max-w-6xl mx-auto" data-section="certificates" data-index={index}>
      <SectionHeading id="certificates" index={index}>{t("certificates")}</SectionHeading>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {entries.map((entry, i) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            <ExpandableCard
              expandedContent={
                <div className="space-y-3">
                  <p className="text-[var(--color-text-muted)] text-sm">
                    {entry.details}
                  </p>
                  {entry.url && (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[var(--color-accent)] hover:underline inline-block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {tc("view_certificate")} →
                    </a>
                  )}
                </div>
              }
            >
              <h3 className="font-semibold">{entry.name}</h3>
              <p className="text-sm text-[var(--color-accent)]">
                {entry.issuer}
              </p>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                {entry.date}
              </p>
              <p className="text-[var(--color-text-muted)] mt-2 text-sm">
                {entry.summary}
              </p>
            </ExpandableCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
