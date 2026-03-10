"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { SectionHeading } from "@/components/ui/section-heading";
import { siteConfig } from "@/lib/site-config";
import { trackEvent } from "@/lib/analytics";

const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 flex-shrink-0" aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 flex-shrink-0" aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const EmailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 flex-shrink-0" aria-hidden="true">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m2 7 10 7 10-7" />
  </svg>
);

export function Footer({ index }: { index?: string } = {}) {
  const t = useTranslations("sections");

  const links = [
    {
      label: "GitHub",
      handle: siteConfig.github.replace("https://", ""),
      href: siteConfig.github,
      icon: <GitHubIcon />,
      external: true,
    },
    {
      label: "LinkedIn",
      handle: siteConfig.linkedin.replace("https://", ""),
      href: siteConfig.linkedin,
      icon: <LinkedInIcon />,
      external: true,
    },
    {
      label: "Email",
      handle: siteConfig.email,
      href: `mailto:${siteConfig.email}`,
      icon: <EmailIcon />,
      external: false,
    },
  ];

  return (
    <footer className="py-24 px-6" data-section="contact" data-index={index}>
      <div className="max-w-4xl mx-auto text-center">
        <SectionHeading id="contact" index={index}>{t("contact")}</SectionHeading>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex justify-center gap-4 mb-16 flex-wrap"
        >
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
              onClick={() => trackEvent("contact-link", { platform: link.label.toLowerCase() })}
              className="group flex items-center gap-3 px-6 py-4 border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-card-hover)] transition-all duration-200 text-left"
            >
              <span className="text-[var(--color-accent)] transition-colors">
                {link.icon}
              </span>
              <span className="flex flex-col">
                <span className="font-sans text-sm font-medium text-[var(--color-text)] leading-none mb-1">
                  {link.label}
                </span>
                <span className="font-sans text-[0.68rem] text-[var(--color-text-muted)] leading-none tracking-wide">
                  {link.handle}
                </span>
              </span>
            </a>
          ))}
        </motion.div>

        <div className="border-t border-[var(--color-border)] pt-8 text-sm text-[var(--color-text-muted)]">
          <p>© {new Date().getFullYear()} {siteConfig.name}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
