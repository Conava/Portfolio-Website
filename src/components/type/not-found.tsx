import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { FacadeWord } from "./room";
import "./type-home.css";

/** Type 404: the number as a facade word, then the message. */
export async function TypeNotFound() {
  const t = await getTranslations("notFound");
  return (
    <section className="ty-nf">
      <FacadeWord word="404" as="p" />
      <h1>{t("message")}</h1>
      <p>
        <Link href="/">{t("home")}</Link>
      </p>
    </section>
  );
}
