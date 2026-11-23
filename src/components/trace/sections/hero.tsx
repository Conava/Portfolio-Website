import { getTranslations } from "next-intl/server";
import type { SectionProps } from "@/components/home-types";
import { DownloadIcon } from "@/components/shared/icons";
import { StatusLine } from "@/components/shared/status-line";
import { TraceCareer } from "./career";
import "./hero.css";

/**
 * Trace hero: the two-line name whose square period is the trace origin (`data-trace-origin`;
 * the trace layer listens for clicks on it and redraws). The period is decorative and hidden
 * from assistive tech: the redraw repeats the load animation and carries no information.
 * At >= 1200px the status line and the CTAs sit in the right column, level with
 * the name's first line; below that they follow the lede.
 */
export async function TraceHero(props: SectionProps) {
  const t = await getTranslations("hero");
  const { about, contact } = props.content;
  const [first, ...rest] = about.name.split(" ");
  return (
    <section id="top" className="wrap t-hero">
      <h1 className="t-name">
        <span className="t-ln">{first} </span>
        <span className="t-ln">
          {rest.join(" ")}
          <span className="t-period" data-trace-origin aria-hidden="true" />
        </span>
      </h1>
      <p className="lede t-hero-lede">{about.lede}</p>
      <div className="t-hero-aside">
        <StatusLine {...props} className="t-status" />
        <p className="t-cta">
          <a className="btn btn-primary" href="/resume.pdf">
            <DownloadIcon />
            {t("resume")}
          </a>
          <a className="btn" href={`mailto:${contact.email}`}>
            {contact.email}
          </a>
        </p>
      </div>
      <TraceCareer {...props} />
    </section>
  );
}
