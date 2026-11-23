import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { Pad } from "@/components/trace/pad";
import { ActionLink } from "@/components/shared/action-link";
import "./about-work.css";

/** Trace about: the statement, then its links. */
export async function TraceAbout({ content }: SectionProps) {
  const t = await getTranslations("sections");
  const { about } = content;
  return (
    <TrackedSection id="about" className="wrap t-about">
      <h2>
        <Pad station="about" label={t("about")} kind="section" />
        {t("about")}
      </h2>
      <div className="t-statement">
        {about.statement.map((s) => (
          <p key={s}>{s}</p>
        ))}
      </div>
      <ul className="btn-row t-about-links">
        {about.links.map((l) => (
          <li key={l.href}>
            <ActionLink href={l.href}>{l.label}</ActionLink>
          </li>
        ))}
      </ul>
    </TrackedSection>
  );
}
