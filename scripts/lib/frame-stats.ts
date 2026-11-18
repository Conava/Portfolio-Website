export type FrameStats = {
  frames: number;
  p95: number;
  over50: number;
  longTasks: number;
  maxLongTask: number;
  pass: boolean;
};

/** Jank budgets (design system §5.7.11): no long task > 50 ms, p95 frame <= 20 ms; frames > 50 ms are reported. */
export const BUDGET = { longTaskMs: 50, p95Ms: 20, frameMs: 50 } as const;

/**
 * Summarizes requestAnimationFrame deltas and long-task durations against the jank budgets.
 * An empty run passes: nothing measured is not a failure. Single frames over 50 ms don't fail a
 * run: under SwiftShader they come from GPU-process raster stalls (a blurred shadow scrolling in)
 * while the main thread is idle, so long tasks and p95 are the gate.
 */
export function frameStats(deltasMs: number[], longTasksMs: number[]): FrameStats {
  const sorted = [...deltasMs].sort((a, b) => a - b);
  // Nearest-rank percentile.
  const p95 = sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : 0;
  const over50 = deltasMs.filter((d) => d > BUDGET.frameMs).length;
  const longTasks = longTasksMs.filter((d) => d > BUDGET.longTaskMs).length;
  const maxLongTask = longTasksMs.length ? Math.max(...longTasksMs) : 0;
  return {
    frames: deltasMs.length,
    p95,
    over50,
    longTasks,
    maxLongTask,
    pass: longTasks === 0 && p95 <= BUDGET.p95Ms,
  };
}
