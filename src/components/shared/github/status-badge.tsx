import { getTranslations } from "next-intl/server";
import type { PrState } from "@/lib/github";
import type { Locale } from "@/lib/types";
import { PrClosedIcon, PrMergedIcon, PrOpenIcon } from "../icons";
import "./github.css";

const ICONS = { OPEN: PrOpenIcon, MERGED: PrMergedIcon, CLOSED: PrClosedIcon } as const;
const KEYS = { OPEN: "open", MERGED: "merged", CLOSED: "closed" } as const;

/** PR state as icon + word, never color alone. */
export async function StatusBadge({ state, locale }: { state: PrState; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "github" });
  const Icon = ICONS[state];
  return (
    <span className="gh-badge" data-pr-state={state}>
      <Icon className="gh-badge-icon" />
      {t(KEYS[state])}
    </span>
  );
}
