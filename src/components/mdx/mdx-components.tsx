import type { MDXComponents } from "mdx/types";

export const mdxComponents: MDXComponents = {
  h1: (props) => (
    <h1
      className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-[var(--color-accent)] to-purple-400 bg-clip-text text-transparent"
      {...props}
    />
  ),
  h2: (props) => (
    <h2
      className="text-2xl md:text-3xl font-bold mt-12 mb-4"
      {...props}
    />
  ),
  h3: (props) => (
    <h3 className="text-xl font-semibold mt-8 mb-3" {...props} />
  ),
  p: (props) => (
    <p
      className="text-[var(--color-text-muted)] leading-relaxed mb-4"
      {...props}
    />
  ),
  ul: (props) => <ul className="space-y-2 mb-4 ml-4 list-none" {...props} />,
  li: ({ children, ...props }) => (
    <li className="text-[var(--color-text-muted)] flex items-start gap-2" {...props}>
      <span className="text-[var(--color-accent)] mt-1 shrink-0">▸</span>
      <span>{children}</span>
    </li>
  ),
  code: (props) => (
    <code
      className="px-2 py-0.5 rounded bg-[var(--color-bg-card)] text-[var(--color-accent)] font-mono text-sm"
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-4 overflow-x-auto mb-4 font-mono text-sm"
      {...props}
    />
  ),
  img: ({ src, alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ""}
      className="rounded-xl border border-[var(--color-border)] my-6 w-full"
      {...props}
    />
  ),
  a: (props) => (
    <a
      className="text-[var(--color-accent)] hover:underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  table: (props) => (
    <div className="overflow-x-auto mb-6">
      <table className="w-full text-sm border-collapse" {...props} />
    </div>
  ),
  thead: (props) => <thead {...props} />,
  tbody: (props) => <tbody {...props} />,
  tr: (props) => (
    <tr className="border-b border-[var(--color-border)]" {...props} />
  ),
  th: (props) => (
    <th
      className="text-left py-2 pr-6 font-semibold text-[var(--color-text)] text-xs uppercase tracking-wider"
      {...props}
    />
  ),
  td: (props) => (
    <td
      className="py-2 pr-6 text-[var(--color-text-muted)]"
      {...props}
    />
  ),
};
