import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { CopyEmail } from "@/components/shared/copy-email";
import { Pad } from "@/components/trace/pad";
import { ActionLink } from "@/components/shared/action-link";
import "./projects-contact.css";

/** Trace contact: the trace ends in a ring (`data-trace-end`) beside the email. */
export async function TraceContact({ content }: SectionProps) {
  const t = await getTranslations("sections");
  const { contact } = content;
  return (
    <TrackedSection id="contact" className="wrap t-contact">
      <h2>
        <Pad station="contact" label={t("contact")} kind="section" />
        {t("contact")}
      </h2>
      <p className="lede">{contact.intro}</p>
      {/* The trace layer arms the terminus and marks its arrival (data-armed / data-arrived). */}
      <div className="t-contact-line">
        <span className="terminus" data-trace-end aria-hidden="true" />
        <CopyEmail email={contact.email} section="contact" className="t-ce" />
      </div>
      <ul className="btn-row t-links">
        {contact.links.map((l) => (
          <li key={l.href}>
            <ActionLink href={l.href}>{l.label}</ActionLink>
          </li>
        ))}
      </ul>
    </TrackedSection>
  );
}
