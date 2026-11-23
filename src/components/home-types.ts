import type { GithubData } from "@/lib/github";
import type { HomeContent, Locale, YearMonth } from "@/lib/types";

/**
 * Props every homepage section of both designs receives. `today` is computed
 * once on the server so lanes and timelines agree with each other and with SSR.
 */
export interface SectionProps {
  content: HomeContent;
  github: GithubData | null;
  locale: Locale;
  today: YearMonth;
}
