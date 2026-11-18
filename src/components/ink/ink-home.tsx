import type { SectionProps } from "@/components/home-types";
import { InkAmbient } from "./ink-bg";
import { InkAbout } from "./sections/about";
import { InkBpmnscript } from "./sections/bpmnscript";
import { InkContact } from "./sections/contact";
import { InkDux } from "./sections/dux";
import { InkEducation } from "./sections/education";
import { InkHero } from "./sections/hero";
import { InkProjects } from "./sections/projects";
import { InkWork } from "./sections/work";
import { ToneBands } from "./tone-bands";

/** The Ink homepage: the eight sections in order plus the page-level controllers and the ambient ink. */
export function InkHome(props: SectionProps) {
  return (
    <>
      <InkHero {...props} />
      <InkAbout {...props} />
      <InkWork {...props} />
      <InkEducation {...props} />
      <InkBpmnscript {...props} />
      <InkDux {...props} />
      <InkProjects {...props} />
      <InkContact {...props} />
      <ToneBands />
      <InkAmbient />
    </>
  );
}
