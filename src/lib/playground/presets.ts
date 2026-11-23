import { PRESETS as UPSTREAM, type Preset as UpstreamPreset } from "@/generated/bpmnscript/editor/presets";

export { DEFAULT_PRESET } from "@/generated/bpmnscript/editor/presets";

export type Preset = UpstreamPreset & {
  /** Public URL of the copy `playground:assets` makes. */
  file: string;
};

export const PRESETS: readonly Preset[] = UPSTREAM.map((p) => ({
  ...p,
  file: `/playground/presets/${p.id}.${p.kind === "source" ? "bpmnscript" : "bpmn"}`,
}));
