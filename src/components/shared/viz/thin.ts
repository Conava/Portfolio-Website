/**
 * Which axis ticks get a label so that at most about `max` show. `must[i]` ticks (every January, which
 * carries the year) always show. The first tick shows too (with its year) unless a must tick is so
 * close that the two labels would collide. The rest show every `ceil(n / max)` ticks; a labelled
 * year needs `room` ticks more than a bare month (0 for bare-year labels). So labels do not collide and a year-less month
 * never follows a January it is not part of.
 */
export function thin(must: boolean[], max: number, room = 1): boolean[] {
  const n = must.length;
  const step = Math.max(1, Math.ceil(n / max));
  const show = [...must];
  const next = (i: number) => {
    for (let j = i + 1; j < n; j++) if (show[j]) return j;
    return Infinity;
  };
  const dated = [...must];
  if (!must[0]) show[0] = dated[0] = next(0) >= step + room;
  let last = show[0] ? 0 : -Infinity;
  for (let i = 1; i < n; i++) {
    if (!show[i]) {
      const j = next(i);
      if (i - last >= step + (dated[last] ? room : 0) && j - i >= step + (must[j] ? room : 0)) show[i] = true;
    }
    if (show[i]) last = i;
  }
  return show;
}
