"use client";

import { useEffect, useRef } from "react";
import type { FlowSceneData } from "./scene-data";

/**
 * True without WebGL2 or with a software renderer (no GPU: SwiftShader, llvmpipe), where the
 * subject would stutter and block input. Such devices get the static page and never load three.js.
 */
function noGpu(): boolean {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return true;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}

/**
 * The fixed canvas behind Flow's text. Loads three.js only here, after hydration.
 * Sets `data-live` on the Flow root: "on" (live subject), "still" (reduced motion, or a device
 * too slow to animate it: one image per stage) or "off" (no usable WebGL, or the context was
 * lost: the page stays static).
 */
export function FlowCanvas({ data }: { data: FlowSceneData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef(data);

  useEffect(() => {
    const canvas = ref.current;
    const root = canvas?.closest<HTMLElement>("[data-flow]");
    if (!canvas || !root) return;
    const fail = () => {
      root.dataset.live = "off";
    };
    if (noGpu()) {
      fail();
      return () => {
        delete root.dataset.live;
      };
    }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stop = () => {};
    let cancelled = false;
    import("./scene")
      .then(({ startFlow }) => {
        if (cancelled) return;
        root.dataset.live = reduced ? "still" : "on";
        stop = startFlow({
          canvas,
          root,
          data: dataRef.current,
          reduced,
          onFail: fail,
          onSlow: () => (root.dataset.live = "still"),
        });
      })
      .catch(fail);
    return () => {
      cancelled = true;
      stop();
      delete root.dataset.live;
    };
  }, []);

  return <canvas ref={ref} className="fl-gl" aria-hidden="true" />;
}
