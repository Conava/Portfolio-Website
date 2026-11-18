/** The playground's files: plain data and pure updates, persisted as JSON in localStorage. */

export type PgFile = {
  /** Stable across renames; the editor model's URI is built from it, so undo survives a rename. */
  id: string;
  name: string;
  /** Current text (what the editor shows). */
  text: string;
  /** Text at the last save (Ctrl+S); differs from `text` while the file is dirty. */
  saved: string;
};

export type Workspace = {
  files: PgFile[];
  /** Ids of the files open as tabs, in tab order. */
  open: string[];
  active: string | null;
};

export const STORAGE_KEY = "pg-workspace-v1";
export const EXT = ".bpmnscript";
const MAX_NAME = 80;

export const isDirty = (f: PgFile) => f.text !== f.saved;
export const fileUri = (id: string) => `file:///playground/${id}${EXT}`;
export const baseName = (name: string) => (name.endsWith(EXT) ? name.slice(0, -EXT.length) : name);

export function defaultWorkspace(name: string, text: string): Workspace {
  return { files: [{ id: "f1", name, text, saved: text }], open: ["f1"], active: "f1" };
}

/** Trims, appends `.bpmnscript` if missing; null for an empty or unusable name. */
export function cleanName(raw: string): string | null {
  const s = raw.trim();
  if (!s || s === EXT || /[/\\]/.test(s)) return null;
  const n = s.endsWith(EXT) ? s : s + EXT;
  return n.length > MAX_NAME ? null : n;
}

/** `name`, or `name-2`, `name-3`, ... before the extension, whichever is free. */
export function uniqueName(ws: Workspace, name: string): string {
  const taken = new Set(ws.files.map((f) => f.name));
  if (!taken.has(name)) return name;
  const base = baseName(name);
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}${EXT}`)) return `${base}-${i}${EXT}`;
}

const nextId = (ws: Workspace) => `f${Math.max(0, ...ws.files.map((f) => Number(f.id.slice(1)) || 0)) + 1}`;

export function activate(ws: Workspace, id: string): Workspace {
  if (!ws.files.some((f) => f.id === id)) return ws;
  return { ...ws, open: ws.open.includes(id) ? ws.open : [...ws.open, id], active: id };
}

/**
 * Opens `text` as a file and activates it. A file with the same name and text is reused,
 * so picking an example twice or reloading a share link does not pile up copies.
 */
export function openText(ws: Workspace, name: string, text: string): { ws: Workspace; id: string } {
  const same = ws.files.find((f) => f.name === name && f.text === text);
  if (same) return { ws: activate(ws, same.id), id: same.id };
  const id = nextId(ws);
  const file = { id, name: uniqueName(ws, name), text, saved: text };
  return { ws: activate({ ...ws, files: [...ws.files, file] }, id), id };
}

export function editFile(ws: Workspace, id: string, text: string): Workspace {
  return { ...ws, files: ws.files.map((f) => (f.id === id && f.text !== text ? { ...f, text } : f)) };
}

export function saveFile(ws: Workspace, id: string): Workspace {
  return { ...ws, files: ws.files.map((f) => (f.id === id && isDirty(f) ? { ...f, saved: f.text } : f)) };
}

export type RenameError = "invalid" | "taken";

export function renameFile(ws: Workspace, id: string, raw: string): Workspace | RenameError {
  const name = cleanName(raw);
  if (!name) return "invalid";
  if (ws.files.some((f) => f.name === name && f.id !== id)) return "taken";
  return { ...ws, files: ws.files.map((f) => (f.id === id ? { ...f, name } : f)) };
}

/** Closes the tab; the active tab passes to its right neighbor, else the left one. */
export function closeTab(ws: Workspace, id: string): Workspace {
  const i = ws.open.indexOf(id);
  if (i < 0) return ws;
  const open = ws.open.filter((x) => x !== id);
  const active = ws.active === id ? (open[i] ?? open[i - 1] ?? null) : ws.active;
  return { ...ws, open, active };
}

export function deleteFile(ws: Workspace, id: string): Workspace {
  const closed = closeTab(ws, id);
  return { ...closed, files: closed.files.filter((f) => f.id !== id) };
}

/** Next (+1) or previous (-1) open tab, wrapping. */
export function cycleTab(ws: Workspace, dir: 1 | -1): Workspace {
  if (!ws.open.length) return ws;
  const i = ws.active ? ws.open.indexOf(ws.active) : -1;
  return { ...ws, active: ws.open[(i + dir + ws.open.length) % ws.open.length] };
}

/** Stored JSON is untrusted (another version, a hand edit): never throws, null when unusable. */
export function parseWorkspace(json: string | null): Workspace | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Partial<Workspace>;
    if (!Array.isArray(v.files) || !Array.isArray(v.open)) return null;
    const files = v.files.filter(
      (f): f is PgFile =>
        !!f && typeof f.id === "string" && /^f\d+$/.test(f.id) && typeof f.name === "string" && typeof f.text === "string" && typeof f.saved === "string",
    );
    if (!files.length) return null;
    const ids = new Set(files.map((f) => f.id));
    if (ids.size !== files.length) return null;
    const open = [...new Set(v.open.filter((id): id is string => typeof id === "string" && ids.has(id)))];
    const active = typeof v.active === "string" && open.includes(v.active) ? v.active : (open[0] ?? null);
    return { files, open, active };
  } catch {
    return null;
  }
}

/** What a new file starts with: the smallest process that compiles, named after the file. */
export const newFileText = (name: string) => `process ${baseName(name).replace(/[^\w-]/g, "-")} {\n  start Start\n  end Done\n}\n`;
