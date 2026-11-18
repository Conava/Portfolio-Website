"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatRelative } from "@/lib/format";
import type { Locale } from "@/lib/types";
import "./github.css";

/** Absolute Berlin time with zone label (format.ts formats UTC without a label). */
const absolute = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Europe/Berlin", timeZoneName: "short" }).format(
    new Date(iso),
  );

/**
 * "Synced <time>". Server and first client render show the absolute time; after mount
 * it becomes relative and refreshes every minute. `stale` comes from the server.
 */
export function SyncLine({ fetchedAt, locale, stale = false }: { fetchedAt: string; locale: Locale; stale?: boolean }) {
  const t = useTranslations("github");
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  const abs = absolute(fetchedAt, locale);
  const time = now ? formatRelative(fetchedAt, now, locale) : abs;
  return (
    <p className="gh-sync">
      {t.rich(stale ? "lastSynced" : "synced", {
        time,
        t: (c) => (
          <time dateTime={fetchedAt} title={abs}>
            {c}
          </time>
        ),
      })}
    </p>
  );
}
