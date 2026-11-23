import { DesignToggle } from "@/components/shared/controls/design-toggle";
import type { Design } from "@/lib/design-values";
import { siteConfig } from "@/lib/site-config";
import type { Locale } from "@/lib/types";

/** Flow footer: the © line and the text design switch. */
export function FlowFooter({ design }: { locale: Locale; design: Design }) {
  return (
    <footer className="wrap fl-ftr">
      <p className="meta">
        © {new Date().getFullYear()} {siteConfig.name}, Hamburg
      </p>
      <DesignToggle current={design} variant="text" via="footer" />
    </footer>
  );
}
