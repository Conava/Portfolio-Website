"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createScene, type Scene } from "@/lib/motion/scroll-engine";

/**
 * Motion preferences from `matchMedia`, live. `pinnable` mirrors the scene CSS
 * gate: width >= `minWidth` and no reduced motion. Both are false until mounted
 * (SSR renders the static final state).
 */
export function useMotionPrefs(minWidth: number): { reduced: boolean; pinnable: boolean } {
  const [prefs, setPrefs] = useState({ reduced: false, pinnable: false });
  useEffect(() => {
    const rm = matchMedia("(prefers-reduced-motion: reduce)");
    const wide = matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setPrefs({ reduced: rm.matches, pinnable: wide.matches && !rm.matches });
    update();
    rm.addEventListener("change", update);
    wide.addEventListener("change", update);
    return () => {
      rm.removeEventListener("change", update);
      wide.removeEventListener("change", update);
    };
  }, [minWidth]);
  return prefs;
}

/**
 * Runs a scroll scene on `ref` while pinnable; otherwise reports the final
 * state (`onProgress(1)`). Callbacks may change between renders without
 * recreating the scene. Returns the live scene (null while not pinnable), e.g.
 * for `disable()` when a panel opens inside the stage.
 */
export function useScene(
  ref: RefObject<HTMLElement | null>,
  opts: {
    minWidth: number;
    smoothing?: number;
    onProgress: (p: number) => void;
    onActive?: (active: boolean) => void;
  },
): RefObject<Scene | null> {
  const { pinnable } = useMotionPrefs(opts.minWidth);
  const cbs = useRef(opts);
  const sceneRef = useRef<Scene | null>(null);
  useEffect(() => {
    cbs.current = opts;
  });

  useEffect(() => {
    const el = ref.current;
    if (!pinnable || !el) {
      cbs.current.onProgress(1);
      return;
    }
    const scene = (sceneRef.current = createScene(el, {
      smoothing: opts.smoothing,
      onProgress: (p) => cbs.current.onProgress(p),
      onActive: (a) => cbs.current.onActive?.(a),
    }));
    return () => {
      scene.destroy();
      sceneRef.current = null;
      cbs.current.onActive?.(false);
    };
  }, [pinnable, opts.smoothing, ref]);
  return sceneRef;
}
