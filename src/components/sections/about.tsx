"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { AnimatedSection } from "@/components/ui/animated-section";
import { SectionHeading } from "@/components/ui/section-heading";
import type { AboutData } from "@/lib/types";
import { siteConfig } from "@/lib/site-config";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number];

const item = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export function About({ data, index }: { data: AboutData; index?: string }) {
  const t = useTranslations("sections");

  return (
    <AnimatedSection className="py-24 px-6 max-w-6xl mx-auto" sectionName="about" sectionIndex={index}>
      <SectionHeading id="about" index={index}>{t("about")}</SectionHeading>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {/* Bio card - spans 2 cols */}
        <motion.div
          variants={item}
          className="theme-card md:col-span-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8"
        >
          <p className="text-lg leading-relaxed text-[var(--color-text-muted)]">
            {data.bio}
          </p>
        </motion.div>

        {/* Photo card */}
        <motion.div
          variants={item}
          className="theme-card rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden flex items-center justify-center min-h-[160px]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={siteConfig.photoPath}
            alt={siteConfig.name}
            className="w-full h-full object-cover"
          />
        </motion.div>

        {/* Skills cards */}
        {data.skills.map((skill, i) => (
          <motion.div
            key={skill.category}
            variants={item}
            transition={{ delay: i * 0.1 }}
            className="theme-card rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6"
          >
            <h3 className="text-sm font-medium text-[var(--color-text-muted)] mb-3">
              {skill.category}
            </h3>
            <div className="flex flex-wrap gap-2">
              {skill.items.map((s) => (
                <span
                  key={s}
                  className="tech-badge px-3 py-1 text-sm rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20"
                >
                  {s}
                </span>
              ))}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </AnimatedSection>
  );
}
