import sharp from "sharp";

export type Tile = { file: string; label: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Composes frames into a labeled grid PNG (each tile scaled to `tileWidth`, label bar under it). */
export async function contactSheet(out: string, tiles: Tile[], opts: { columns?: number; tileWidth?: number } = {}): Promise<void> {
  if (!tiles.length) return;
  const columns = Math.min(opts.columns ?? 5, tiles.length);
  const tileWidth = opts.tileWidth ?? 320;
  const meta = await sharp(tiles[0].file).metadata();
  const tileHeight = Math.round(((meta.height ?? 1) / (meta.width ?? 1)) * tileWidth);
  const LABEL = 22, GAP = 6;
  const cellH = tileHeight + LABEL;
  const rows = Math.ceil(tiles.length / columns);
  const width = columns * tileWidth + (columns + 1) * GAP;
  const height = rows * cellH + (rows + 1) * GAP;
  const layers = await Promise.all(
    tiles.flatMap((t, i) => {
      const left = GAP + (i % columns) * (tileWidth + GAP);
      const top = GAP + Math.floor(i / columns) * (cellH + GAP);
      const label = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${LABEL}"><rect width="100%" height="100%" fill="#111"/><text x="6" y="15" font-family="monospace" font-size="13" fill="#fff">${esc(t.label)}</text></svg>`;
      return [
        sharp(t.file).resize(tileWidth, tileHeight, { fit: "fill" }).png().toBuffer().then((input) => ({ input, left, top })),
        Promise.resolve({ input: Buffer.from(label), left, top: top + tileHeight }),
      ];
    }),
  );
  await sharp({ create: { width, height, channels: 3, background: "#777" } }).composite(layers).png().toFile(out);
}
