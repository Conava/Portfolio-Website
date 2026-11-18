"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/** Flow 404: the requested path, the message in the display serif, a way home. */
export function FlowNotFound() {
  const t = useTranslations("notFound");
  const path = usePathname();
  return (
    <section className="wrap fl-nf">
      <p className="fl-nf-path">{path}</p>
      <h1>{t("message")}</h1>
      <p>
        <Link href="/">{t("home")}</Link>
      </p>
    </section>
  );
}
