/**
 * Greedy row packing for marks on a time axis. `x` is 0..1 along the plot, `left`/`right` are the
 * mark's extent in px around its x. Marks must be sorted by x. Positions are packed against
 * `width` px, the narrowest plot the chart is drawn at, so on any wider plot they only gain space.
 */
export function packRows(marks: { x: number; left: number; right: number }[], width: number, gap: number): number[] {
  const ends: number[] = []; // right edge (px) of the last mark per row
  return marks.map(({ x, left, right }) => {
    const px = x * width;
    let row = ends.findIndex((e) => px - left - e >= gap);
    if (row < 0) row = ends.length;
    ends[row] = px + right;
    return row;
  });
}
