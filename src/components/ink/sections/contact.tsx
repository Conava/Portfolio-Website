import { getTranslations } from "next-intl/server";
import { TrackedSection } from "@/components/analytics/tracked-section";
import type { SectionProps } from "@/components/home-types";
import { CopyEmail } from "@/components/shared/copy-email";
import { ActionLink } from "@/components/shared/action-link";
import "./projects-contact.css";

/** Ink contact: intro, the address as a copy button (pen-stroke underline on copy) and links. */
export async function InkContact({ content }: SectionProps) {
  const t = await getTranslations("sections");
  const { contact } = content;
  return (
    <TrackedSection id="contact" data-tone="scene" className="ink-contact">
      <div className="wrap">
        <h2>{t("contact")}</h2>
        <p className="lede">{contact.intro}</p>
        <CopyEmail email={contact.email} section="contact" className="ic-email" />
        <ul className="btn-row ic-links">
          {contact.links.map((l) => (
            <li key={l.href}>
              <ActionLink href={l.href}>{l.label}</ActionLink>
            </li>
          ))}
        </ul>
      </div>
    </TrackedSection>
  );
}
