import type { SectionProps } from "@/components/home-types";
import { Rail } from "./rail";
import { TraceAbout } from "./sections/about";
import { TraceBpmnscript } from "./sections/bpmnscript";
import { TraceContact } from "./sections/contact";
import { TraceDux } from "./sections/dux";
import { TraceEducation } from "./sections/education";
import { TraceHero } from "./sections/hero";
import { TraceProjects } from "./sections/projects";
import { TraceWork } from "./sections/work";
import { StationKeys } from "./station-keys";
import { TraceLayer } from "./trace-layer";

/** The Trace homepage: the eight sections in order plus the page-level controllers. */
export function TraceHome(props: SectionProps) {
  return (
    <>
      <TraceHero {...props} />
      <TraceAbout {...props} />
      <TraceWork {...props} />
      <TraceEducation {...props} />
      <TraceBpmnscript {...props} />
      <TraceDux {...props} />
      <TraceProjects {...props} />
      <TraceContact {...props} />
      <TraceLayer content={props.content} today={props.today} />
      <Rail />
      <StationKeys />
    </>
  );
}
