import { useId, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import "./bpmn.css";

// Geometry is the BPMNscript v0.1.1 compiler layout (the `dc:Bounds` / `di:waypoint`
// values in INVOICE_XML). Elements carry `data-s`, the step at which a scene reveals them.

function Task({ s, x, y, lines, kind }: { s: number; x: number; y: number; lines: [string, string]; kind: "user" | "service" }) {
  return (
    <g data-s={s}>
      <rect className="nd" x={x} y={y} width="100" height="80" rx="10" />
      <text x={x + 50} y={y + 38}>
        <tspan x={x + 50}>{lines[0]}</tspan>
        <tspan x={x + 50} dy="16">{lines[1]}</tspan>
      </text>
      {kind === "user" ? (
        <path className="ic" d={`M${x + 12},${y + 18}a4,4 0 1,0 0.01,0M${x + 6},${y + 28}c1-4,11-4,12,0`} />
      ) : (
        <>
          <circle className="ic" cx={x + 12} cy={y + 13} r="5" />
          <circle className="ic-fill" cx={x + 12} cy={y + 13} r="1.6" />
        </>
      )}
    </g>
  );
}

function Gateway({ s, cx }: { s: number; cx: number }) {
  return (
    <g data-s={s}>
      <polygon className="nd" points={`${cx},45 ${cx + 25},70 ${cx},95 ${cx - 25},70`} />
      <path className="ic x" d={`M${cx - 8},62L${cx + 8},78M${cx + 8},62L${cx - 8},78`} />
    </g>
  );
}

/**
 * Length of an M/L/Q path in user units, rounded up. A Q corner counts its control polygon, a
 * slight overestimate, which is all a draw-in dash needs.
 */
export function edgeLength(d: string): number {
  const nums = d.match(/-?[\d.]+/g)!.map(Number);
  let len = 0;
  for (let i = 2; i + 1 < nums.length; i += 2) len += Math.hypot(nums[i] - nums[i - 2], nums[i + 1] - nums[i - 1]);
  return Math.ceil(len) + 1;
}

/**
 * A sequence flow. `--len` is its length in user units (px at the diagram's scale and up), so
 * scenes can dash it in real units: dashing a normalized pathLength makes every repaint of the
 * diagram slow to raster in Chromium.
 */
function Edge({ s, d, m }: { s: number; d: string; m: string }) {
  return (
    <path className="ed" data-s={s} style={{ "--len": edgeLength(d) } as CSSProperties} markerEnd={`url(#${m})`} d={d} />
  );
}

/** `eventLabels={false}` omits the start and end names, as the compiled diagram has none. */
export function InvoiceDiagram({ eventLabels = true }: { eventLabels?: boolean } = {}) {
  const t = useTranslations("scene");
  const m = `bpmn-ar-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <>
      <svg className="bpmn-diagram" viewBox="20 20 840 240" role="img" aria-label={t("diagramLabel")}>
        <defs>
          <marker id={m} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,1L9,5L0,9z" fill="currentColor" />
          </marker>
        </defs>
        <g data-s="1">
          <circle className="nd" cx="75" cy="70" r="18" />
          {eventLabels && <text x="75" y="112">Review Start</text>}
        </g>
        <Edge s={2} m={m} d="M93,70L175,70" />
        <Task s={2} x={175} y={30} lines={["Review", "Invoice"]} kind="user" />
        <Edge s={3} m={m} d="M275,70L350,70" />
        <Gateway s={3} cx={375} />
        <Edge s={4} m={m} d="M400,70L475,70" />
        <text className="lbl" data-s="4" x="437" y="50">
          <tspan x="437">amount</tspan>
          <tspan x="437" dy="15">&gt; 1000</tspan>
        </text>
        <Task s={4} x={475} y={30} lines={["Senior", "Approval"]} kind="user" />
        <Edge s={5} m={m} d="M375,95L375,205Q375,210 380,210L475,210" />
        <path className="ic" data-s="5" d="M369,108L381,116" />
        <Task s={6} x={475} y={170} lines={["Auto", "Approve"]} kind="service" />
        <Gateway s={7} cx={675} />
        <Edge s={7} m={m} d="M575,70L650,70" />
        <Edge s={7} m={m} d="M575,210L670,210Q675,210 675,205L675,95" />
        <Edge s={8} m={m} d="M700,70L807,70" />
        <g data-s="8">
          <circle className="nd end" cx="825" cy="70" r="18" />
          {eventLabels && <text x="825" y="112">Done</text>}
        </g>
      </svg>
      <ol className="bpmn-sr">
        {(t.raw("diagramSteps") as string[]).map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </>
  );
}
