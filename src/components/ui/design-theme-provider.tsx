"use client";

import { createContext, useContext, useLayoutEffect, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { DESIGN_THEMES, DEFAULT_THEME, LS_KEY } from "@/lib/design-themes";
import type { DesignTheme } from "@/lib/design-themes";

function readStoredTheme(): DesignTheme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored && (DESIGN_THEMES as readonly string[]).includes(stored)) {
      return stored as DesignTheme;
    }
  } catch {}
  return DEFAULT_THEME;
}

interface DesignThemeContextValue {
  theme: DesignTheme;
  setTheme: (theme: DesignTheme) => void;
}

const DesignThemeContext = createContext<DesignThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

export function DesignThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<DesignTheme>(readStoredTheme);

  // Keep DOM attribute in sync — runs before paint so no flash.
  // Handles soft-navigation stripping the attribute (RSC reconciliation).
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((next: DesignTheme) => {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(LS_KEY, next);
    } catch {
      // ignore quota errors
    }
  }, []);

  // Read ?theme= URL param on first client render, apply it, then strip from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const themeParam = params.get("theme");
    if (themeParam && (DESIGN_THEMES as readonly string[]).includes(themeParam)) {
      setTheme(themeParam as DesignTheme);
    }
    if (params.has("theme")) {
      params.delete("theme");
      const clean =
        window.location.pathname +
        (params.toString() ? "?" + params.toString() : "") +
        window.location.hash;
      window.history.replaceState({}, "", clean);
    }
  }, []); // run once on mount

  return (
    <DesignThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </DesignThemeContext.Provider>
  );
}

export function useDesignTheme() {
  return useContext(DesignThemeContext);
}
