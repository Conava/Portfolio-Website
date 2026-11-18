"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FitIcon, ZoomInIcon, ZoomOutIcon } from "@/components/shared/icons";
import { formatPercent } from "@/lib/format";
import type { Locale } from "@/lib/types";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "./diagram-pane.css";

// Minimal slices of the diagram-js services this pane uses.
type Box = { x: number; y: number; width: number; height: number };
type Viewbox = Box & { scale: number; inner: Box; outer: { width: number; height: number } };
type Canvas = {
  viewbox(box?: Box): Viewbox;
  zoom(scale?: number): number;
  resized(): void;
  getContainer(): HTMLElement;
};
type Element = { type: string; parent?: unknown; waypoints?: unknown };
type Viewer = {
  importXML(xml: string): Promise<unknown>;
  get<T>(name: string): T;
  on(event: string, fn: () => void): void;
  destroy(): void;
};

const LABEL_PX = 14;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const STEP = 1.2;
const PAD = 24;
const GRID = 20;

type Props = {
  xml: string | null;
  /** A new value fits the next diagram to the pane; the same value refits too, until the visitor zooms or pans. */
  fitKey: string;
  label: string;
  /** Called with bpmn-js's message when `xml` does not import; the last good diagram stays. */
  onError?: (message: string) => void;
  /** Shown until the first diagram is rendered (the server's resting frame). */
  fallback?: ReactNode;
};

/** Renders compiled BPMN XML with bpmn-js (NavigatedViewer), colored by the playground tokens. */
export function DiagramPane({ xml, fitKey, label, onError, fallback }: Props) {
  const t = useTranslations("playground.diagram");
  const locale = useLocale() as Locale;
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Promise<Viewer | null> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef(0);
  const lastGood = useRef<string | null>(null);
  const fittedKey = useRef<string | null>(null);
  const pendingFit = useRef(false);
  // Set once the visitor zooms or pans; until then the diagram stays fitted to the pane.
  const manual = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [elements, setElements] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const labelRef = useRef(label);
  labelRef.current = label;
  const hint = t("keysHint");
  const hintRef = useRef(hint);
  hintRef.current = hint;

  // One viewer per mount; bpmn-js is fetched only when this pane renders.
  useEffect(() => {
    const host = hostRef.current!;
    let viewer: Viewer | null = null;
    let disposed = false;
    const ro = new ResizeObserver(() => {
      if (!viewer) return;
      const canvas = viewer.get<Canvas>("canvas");
      canvas.resized();
      if ((pendingFit.current || !manual.current) && host.clientWidth > 0) fit(canvas);
      else syncGrid(canvas);
    });
    const touched = () => (manual.current = true);
    // A drag pans; a plain click (focus) does not count.
    const dragged = (e: PointerEvent) => e.buttons && touched();
    host.addEventListener("wheel", touched, { passive: true });
    host.addEventListener("pointermove", dragged);

    viewerRef.current = (async () => {
      const [{ default: NavigatedViewer }] = await Promise.all([
        import("bpmn-js/lib/NavigatedViewer"),
        document.fonts.ready,
      ]);
      // Canvas text measurement needs a literal font family, not var().
      const fontFamily = getComputedStyle(host).fontFamily;
      const v = new NavigatedViewer({
        container: host,
        bpmnRenderer: {
          defaultFillColor: "var(--pg-diagram-fill)",
          defaultStrokeColor: "var(--pg-diagram-stroke)",
          defaultLabelColor: "var(--pg-diagram-label)",
        },
        textRenderer: {
          defaultStyle: { fontFamily, fontSize: LABEL_PX, lineHeight: 1.2 },
          externalStyle: { fontSize: LABEL_PX },
        },
      }) as unknown as Viewer;
      if (disposed) {
        v.destroy();
        return null;
      }
      viewer = v;
      const canvas = v.get<Canvas>("canvas");
      const svg = canvas.getContainer().querySelector("svg");
      svg?.setAttribute("role", "img");
      svg?.setAttribute("aria-label", labelRef.current);
      // Focusable so bpmn-js's keyboard (bound to the svg by default) receives keys.
      svg?.setAttribute("tabindex", "0");
      svg?.setAttribute("aria-description", hintRef.current);
      v.on("canvas.viewbox.changed", () => {
        setZoom(canvas.zoom());
        syncGrid(canvas);
      });
      ro.observe(host);
      return v;
    })();

    return () => {
      disposed = true;
      ro.disconnect();
      host.removeEventListener("wheel", touched);
      host.removeEventListener("pointermove", dragged);
      viewer?.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    hostRef.current?.querySelector("svg")?.setAttribute("aria-label", label);
  }, [label]);

  useEffect(() => {
    hostRef.current?.querySelector("svg")?.setAttribute("aria-description", hint);
  }, [hint]);

  useEffect(() => {
    if (xml == null) return;
    const seq = ++latest.current;
    const key = fitKey;
    queue.current = queue.current.then(async () => {
      const viewer = await viewerRef.current;
      // A newer xml is queued behind this one; skip straight to it.
      if (!viewer || seq !== latest.current) return;
      const canvas = viewer.get<Canvas>("canvas");
      // A hidden pane (phone tab) has a zero-size viewbox; restoring it would divide by zero.
      const box = lastGood.current ? canvas.viewbox() : null;
      const before = box && box.width > 0 && box.height > 0 ? box : null;
      try {
        await viewer.importXML(xml);
        lastGood.current = xml;
      } catch (err) {
        onErrorRef.current?.(err instanceof Error ? err.message : String(err));
        if (!lastGood.current) return;
        await viewer.importXML(lastGood.current).catch(() => {});
        if (before) canvas.viewbox(before);
        return;
      }
      setElements(countShapes(viewer));
      // A new file always fits; an edit keeps the view only once the visitor has zoomed or panned.
      if (key !== fittedKey.current) manual.current = false;
      if (key !== fittedKey.current || !before || !manual.current) {
        fittedKey.current = key;
        fit(canvas);
      } else {
        canvas.viewbox(before);
      }
    });
  }, [xml, fitKey]);

  function fit(canvas: Canvas) {
    const { inner, outer } = canvas.viewbox();
    if (outer.width === 0 || outer.height === 0) {
      // Hidden pane (phone tab): fit once it has a size.
      pendingFit.current = true;
      return;
    }
    pendingFit.current = false;
    // canvas.zoom("fit-viewport", "auto") with a margin: the whole diagram, centered, never above 100 %.
    const room = { w: Math.max(1, outer.width - 2 * PAD), h: Math.max(1, outer.height - 2 * PAD) };
    const scale = Math.min(1, room.w / inner.width, room.h / inner.height);
    const w = outer.width / scale;
    const h = outer.height / scale;
    canvas.viewbox({ x: inner.x + inner.width / 2 - w / 2, y: inner.y + inner.height / 2 - h / 2, width: w, height: h });
  }

  // The dot grid moves and scales with the diagram, like any drawing canvas.
  function syncGrid(canvas: Canvas) {
    const { x, y, scale, width, inner } = canvas.viewbox();
    const host = hostRef.current;
    if (!host) return;
    // Fade the edge where more diagram lies beyond the pane, so a clipped diagram reads as pannable.
    host.style.setProperty("--pg-fade-l", x > inner.x + 1 ? "32px" : "0px");
    host.style.setProperty("--pg-fade-r", x + width < inner.x + inner.width - 1 ? "32px" : "0px");
    const size = GRID * scale;
    host.style.backgroundSize = `${size}px ${size}px`;
    host.style.backgroundPosition = `${-x * scale}px ${-y * scale}px`;
  }

  async function zoomBy(factor: number | "fit") {
    const viewer = await viewerRef.current;
    if (!viewer) return;
    const canvas = viewer.get<Canvas>("canvas");
    manual.current = factor !== "fit";
    if (factor === "fit") fit(canvas);
    else canvas.zoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, canvas.zoom() * factor)));
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key.startsWith("Arrow")) manual.current = true;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const action = e.key === "+" || e.key === "=" ? STEP : e.key === "-" ? 1 / STEP : e.key === "0" ? "fit" : null;
    if (action == null) return;
    e.preventDefault();
    void zoomBy(action);
  }

  const ready = elements != null;

  return (
    <div className="pg-diagram" data-pg-diagram="" data-elements={elements ?? undefined} onKeyDown={onKeyDown}>
      <div ref={hostRef} className="pg-diagram-canvas" />
      {!ready && fallback && <div className="pg-diagram-fallback">{fallback}</div>}
      <div className="pg-diagram-controls">
        <button type="button" className="icon-btn" aria-label={t("zoomOut")} data-tip={t("zoomOut")} onClick={() => zoomBy(1 / STEP)}>
          <ZoomOutIcon />
        </button>
        <output className="pg-diagram-zoom" aria-live="off">
          {formatPercent(zoom * 100, locale, 0)}
        </output>
        <button type="button" className="icon-btn" aria-label={t("zoomIn")} data-tip={t("zoomIn")} onClick={() => zoomBy(STEP)}>
          <ZoomInIcon />
        </button>
        <button type="button" className="icon-btn" aria-label={t("fit")} data-tip={t("fit")} data-tip-align="end" onClick={() => zoomBy("fit")}>
          <FitIcon />
        </button>
      </div>
    </div>
  );
}

function countShapes(viewer: Viewer): number {
  const registry = viewer.get<{ filter(fn: (e: Element) => boolean): Element[] }>("elementRegistry");
  return registry.filter((e) => e.parent != null && e.type !== "label" && e.waypoints == null).length;
}
