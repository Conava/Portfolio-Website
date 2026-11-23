"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { ModeIcon } from "@/components/shared/icons";
import { trackEvent } from "@/lib/analytics";
import { installNavContinuity } from "./nav-continuity";
import "./controls.css";

const noop = () => () => {};

/** Half-circle icon button; follows the system until the visitor picks (next-themes). */
export function ColorModeToggle() {
  const t = useTranslations("controls");
  const { resolvedTheme, setTheme } = useTheme();
  // The resolved theme exists only on the client.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useEffect(installNavContinuity, []);

  // Same box, no label: it needs JS anyway, and a guessed label could be wrong.
  if (!mounted) {
    return (
      <span className="icon-btn" aria-hidden="true" style={{ visibility: "hidden" }}>
        <ModeIcon />
      </span>
    );
  }

  const to = resolvedTheme === "dark" ? "light" : "dark";
  const label = to === "dark" ? t("toDark") : t("toLight");
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={label}
      data-tip={label}
      onClick={() => {
        setTheme(to);
        trackEvent("color_mode", { to });
      }}
    >
      <ModeIcon />
    </button>
  );
}
