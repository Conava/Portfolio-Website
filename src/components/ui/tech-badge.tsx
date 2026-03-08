export function TechBadge({ name }: { name: string }) {
  return (
    <span className="tech-badge inline-block px-3 py-1 text-xs font-medium rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20">
      {name}
    </span>
  );
}
