import { DesignToggle } from "@/components/shared/controls/design-toggle";
import type { Design } from "@/lib/design";
import { siteConfig } from "@/lib/site-config";
import type { Locale } from "@/lib/types";
import "./chrome.css";

/** Type footer: copyright and the text design switch. */
export async function TypeFooter({
  design,
}: {
  locale: Locale;
  design: Design;
}) {
  return (
    <footer className="ty-ftr">
      <p>
        © {new Date().getFullYear()} {siteConfig.name}, Hamburg
      </p>
      <DesignToggle current={design} variant="text" via="footer" />
    </footer>
  );
}
