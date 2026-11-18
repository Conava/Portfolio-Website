import { getTranslations } from "next-intl/server";
import type { SectionProps } from "@/components/home-types";
import { DownloadIcon } from "@/components/shared/icons";
import { StatusLine } from "@/components/shared/status-line";
import { HeroStage } from "./hero-stage";
import "./hero.css";

/** Ink hero: the name over the pen ink, the lede, the status line and the two CTAs. */
export async function InkHero(props: SectionProps) {
  const t = await getTranslations("hero");
  const { about, contact } = props.content;
  const [first, ...rest] = about.name.split(" ");

  return (
    <HeroStage first={first} last={rest.join(" ")}>
      <p className="lede ink-hero-lede">{about.lede}</p>
      <StatusLine {...props} className="ink-hero-status" />
      <div className="ink-hero-cta">
        <a className="btn btn-primary" href="/resume.pdf">
          <DownloadIcon />
          {t("resume")}
        </a>
        <a className="btn" href={`mailto:${contact.email}`}>
          {contact.email}
        </a>
      </div>
    </HeroStage>
  );
}
