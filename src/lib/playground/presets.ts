export type Preset = {
  id: string;
  kind: "source" | "bpmn";
  /** Path inside the BPMNscript repo. */
  upstreamPath: string;
  /** Public URL of the copied file. */
  file: string;
};

const ex = "examples/spring-boot/processes/";
const src = (id: string): Preset => ({
  id,
  kind: "source",
  upstreamPath: `${ex}${id}.bpmnscript`,
  file: `/playground/presets/${id}.bpmnscript`,
});
const bpmn = (id: string, upstreamPath: string): Preset => ({
  id,
  kind: "bpmn",
  upstreamPath,
  file: `/playground/presets/${id}.bpmn`,
});

export const PRESETS: readonly Preset[] = [
  src("invoice-approval"),
  src("loan-approval"),
  src("parallel-approval"),
  src("compensating-saga"),
  src("support-ticket"),
  src("order-handling"),
  bpmn("invoice-handwritten", "tests/golden/invoice-approval-handwritten.bpmn"),
  bpmn("invoice-receipt", "tests/fixtures/invoice-receipt.bpmn"),
  bpmn("error-start", "tests/fixtures/error-start.bpmn"),
  bpmn("service-no-binding", "tests/golden/bad-service-task-no-binding.bpmn"),
];

export const DEFAULT_PRESET = "invoice-approval";
