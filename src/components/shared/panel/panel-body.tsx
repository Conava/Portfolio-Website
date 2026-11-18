import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Panel } from "@/lib/types";

/**
 * Content of a DetailPanel: "What I did" as a short list, an optional one-line
 * "Why it mattered" highlight and an optional viz column. `level` keeps the
 * heading order intact: 4 under a row's h3 (default), 3 when the panel sits
 * directly under a section's h2.
 */
export function PanelBody({ panel, viz, level = 4 }: { panel: Panel; viz?: ReactNode; level?: 3 | 4 }) {
  const t = useTranslations("panel");
  const H = `h${level}` as "h3" | "h4";
  return (
    <>
      <div className="dp-prose">
        <H className="dp-head">{t("did")}</H>
        <ul>
          {panel.did.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
        {panel.significant ? (
          <p className="dp-sig">
            <strong>{t("significant")}</strong> {panel.significant}
          </p>
        ) : null}
      </div>
      {/* A div, not a figure: each viz renders its own <figure> with its caption. */}
      {viz ? <div className="dp-viz">{viz}</div> : null}
    </>
  );
}
