import { DesignToggle } from "@/components/shared/controls/design-toggle";
import type { Design } from "@/lib/design";
import { siteConfig } from "@/lib/site-config";
import type { Locale } from "@/lib/types";
import "./chrome.css";

/** Ink footer: the © line, the text design switch and the profile links, in the contact scene tone. */
export function InkFooter({ design }: { locale: Locale; design: Design }) {
  return (
    <footer className="ink-ftr" data-tone="scene">
      <div className="wrap ink-ftr-row">
        <p>
          © {new Date().getFullYear()} {siteConfig.name}, Hamburg
        </p>
        <DesignToggle current={design} variant="text" via="footer" />
        <ul className="ink-ftr-links">
          <li>
            <a href={siteConfig.github} rel="noopener">
              GitHub
            </a>
          </li>
          <li>
            <a href={siteConfig.linkedin} rel="noopener">
              LinkedIn
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
