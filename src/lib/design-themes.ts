// src/lib/design-themes.ts

export const DESIGN_THEMES = ["cobalt", "iris", "manifesto", "atelier"] as const;

export type DesignTheme = (typeof DESIGN_THEMES)[number];

export const THEME_META: Record<
  DesignTheme,
  { label: string; accent: string; description: string }
> = {
  cobalt: {
    label: "Cobalt",
    accent: "#2563EB",
    description: "Electric blue · Plus Jakarta Sans",
  },
  iris: {
    label: "Iris",
    accent: "#7C3AED",
    description: "Deep violet · Sora",
  },
  manifesto: {
    label: "Manifesto",
    accent: "#CCFF00",
    description: "Acid editorial · Fraunces",
  },
  atelier: {
    label: "Atelier",
    accent: "#C9A96E",
    description: "Luxury gold · Cormorant Garamond",
  },
};

export const DEFAULT_THEME: DesignTheme = "atelier";
export const LS_KEY = "portfolio-design-theme";
