"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";

interface ExpandableCardProps {
  children: ReactNode;
  expandedContent: ReactNode;
  className?: string;
}

export function ExpandableCard({
  children,
  expandedContent,
  className = "",
}: ExpandableCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const t = useTranslations("common");

  return (
    <motion.div
      layout
      className={`expandable-card border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 cursor-pointer transition-colors hover:bg-[var(--color-bg-card-hover)] ${className}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <motion.div layout="position">{children}</motion.div>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pt-4 border-t border-[var(--color-border)] mt-4">
              {expandedContent}
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
  );
}
