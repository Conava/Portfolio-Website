import type { ReactNode } from "react";

interface GradientBorderProps {
  children: ReactNode;
  className?: string;
}

export function GradientBorder({
  children,
  className = "",
}: GradientBorderProps) {
  return (
    <div className={`gradient-border-wrapper relative group ${className}`}>
      <div className="gradient-border-layer absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm" />
      <div className="gradient-border-layer absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-25 transition-opacity duration-500" />
      <div className="relative rounded-2xl bg-[var(--color-bg-card)]">
        {children}
      </div>
    </div>
  );
}
