"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

interface AnimatedSectionProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  sectionName?: string;
  sectionIndex?: string;
}

export function AnimatedSection({
  children,
  className = "",
  delay = 0,
  sectionName,
  sectionIndex,
}: AnimatedSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
      data-section={sectionName}
      data-index={sectionIndex}
    >
      {children}
    </motion.section>
  );
}
