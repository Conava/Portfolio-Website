"use client";

import type { ReactNode } from "react";
import { useRef, useEffect } from "react";
import { motion } from "framer-motion";

interface SectionHeadingProps {
  children: ReactNode;
  id?: string;
  index?: string; // e.g. "II", "III" — used by Manifesto theme for watermark numbers
}

export function SectionHeading({ children, id, index }: SectionHeadingProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = headingRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("in-view");
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="section-heading-wrap relative" data-index={index ?? ""}>
      <motion.h2
        ref={headingRef}
        id={id}
        initial={{ opacity: 0, y: 60 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="text-4xl md:text-5xl font-bold mb-12 text-center relative z-10 scroll-mt-24"
      >
        {children}
      </motion.h2>
    </div>
  );
}
