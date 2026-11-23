import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { ActionLink } from "@/components/shared/action-link";
import "./about-work.css";

/** Ink about: the statement as large lyric lines that light at the reading line (CSS), and the profile links. */
export async function InkAbout({ content }: SectionProps) {
  const t = await getTranslations("sections");
  const { about } = content;
  return (
    <TrackedSection id="about" data-tone="paper" className="wrap grid-12 ink-about">
      <h2>{t("about")}</h2>
      <div className="ink-statement">
        {about.statement.map((s) => (
          <p key={s} className="lede">
            {s}
          </p>
        ))}
      </div>
      <ul className="btn-row ink-links">
        {about.links.map((l) => (
          <li key={l.href}>
            <ActionLink href={l.href}>{l.label}</ActionLink>
          </li>
        ))}
      </ul>
    </TrackedSection>
  );
}
