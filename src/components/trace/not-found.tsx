import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import "./sections/projects-contact.css";

/** Trace 404: the lit trace runs down the gutter and ends in an open ring, then the message. */
export async function TraceNotFound() {
  const t = await getTranslations("notFound");
  return (
    <section className="wrap t-nf">
      <svg className="t-nf-trace" width="12" aria-hidden="true" focusable="false">
        <rect x="5.25" y="0" width="1.5" style={{ height: "calc(100% - 12px)" }} />
        <circle cx="6" r="5" style={{ cy: "calc(100% - 6px)" }} />
      </svg>
      <h1>{t("message")}</h1>
      <p>
        <Link href="/">{t("home")}</Link>
      </p>
    </section>
  );
}
