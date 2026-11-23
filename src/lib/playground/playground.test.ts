import { describe, expect, test } from "bun:test";
import { shouldReportCompileError } from "./outcome";
import { DEFAULT_PRESET, PRESETS } from "./presets";
import {
  activate,
  cleanName,
  closeTab,
  cycleTab,
  defaultWorkspace,
  deleteFile,
  editFile,
  isDirty,
  openText,
  parseWorkspace,
  renameFile,
  saveFile,
  type Workspace,
} from "./workspace";

// compileView, importView, exportName, share links and the diagram helpers are tested where they
// live, in @bpmn-script/editor.
describe("outcome", () => {
  test("shouldReportCompileError", () => {
    expect(shouldReportCompileError("pending", "error")).toBe(true);
    expect(shouldReportCompileError("ok", "error")).toBe(true);
    expect(shouldReportCompileError("error", "error")).toBe(false);
    expect(shouldReportCompileError("error", "ok")).toBe(false);
  });
});

describe("workspace", () => {
  const three = () => {
    let ws = defaultWorkspace("a.bpmnscript", "A");
    ws = openText(ws, "b.bpmnscript", "B").ws;
    return openText(ws, "c.bpmnscript", "C").ws;
  };
  test("opening text: new files activate, an identical file is reused, names stay unique", () => {
    let ws = three();
    expect(ws.files.map((f) => [f.id, f.name])).toEqual([["f1", "a.bpmnscript"], ["f2", "b.bpmnscript"], ["f3", "c.bpmnscript"]]);
    expect(ws.open).toEqual(["f1", "f2", "f3"]);
    expect(ws.active).toBe("f3");
    const again = openText(ws, "a.bpmnscript", "A");
    expect(again.id).toBe("f1");
    expect(again.ws.files).toHaveLength(3);
    expect(again.ws.active).toBe("f1");
    ws = openText(ws, "a.bpmnscript", "other").ws;
    expect(ws.files.at(-1)).toMatchObject({ id: "f4", name: "a-2.bpmnscript" });
  });
  test("editing marks dirty until saved", () => {
    let ws = editFile(three(), "f2", "B2");
    expect(ws.files.map(isDirty)).toEqual([false, true, false]);
    ws = saveFile(ws, "f2");
    expect(ws.files[1]).toMatchObject({ text: "B2", saved: "B2" });
    expect(ws.files.some(isDirty)).toBe(false);
  });
  test("rename keeps the id; rejects empty, slashes and taken names", () => {
    const ws = three();
    const r = renameFile(ws, "f1", " main ") as Workspace;
    expect(r.files[0]).toMatchObject({ id: "f1", name: "main.bpmnscript" });
    expect(renameFile(ws, "f1", "  ")).toBe("invalid");
    expect(renameFile(ws, "f1", "x/y")).toBe("invalid");
    expect(renameFile(ws, "f1", "b")).toBe("taken");
    expect(cleanName("a.bpmnscript")).toBe("a.bpmnscript");
    expect(cleanName("x".repeat(81))).toBeNull();
  });
  test("closing and deleting move the active tab to a neighbor", () => {
    let ws = activate(three(), "f2");
    ws = closeTab(ws, "f2");
    expect(ws).toMatchObject({ open: ["f1", "f3"], active: "f3" });
    expect(ws.files).toHaveLength(3);
    ws = deleteFile(ws, "f3");
    expect(ws).toMatchObject({ open: ["f1"], active: "f1" });
    expect(ws.files.map((f) => f.id)).toEqual(["f1", "f2"]);
    ws = closeTab(ws, "f1");
    expect(ws).toMatchObject({ open: [], active: null });
    expect(activate(ws, "f2")).toMatchObject({ open: ["f2"], active: "f2" });
    expect(cycleTab(three(), 1).active).toBe("f1");
    expect(cycleTab(three(), -1).active).toBe("f2");
  });
  test("parseWorkspace round trips and never throws on junk", () => {
    const ws = editFile(three(), "f1", "edited");
    expect(parseWorkspace(JSON.stringify(ws))).toEqual(ws);
    for (const junk of [null, "", "{", "[]", '{"files":[],"open":[]}', '{"files":[{"id":1}],"open":[]}', "null"])
      expect(parseWorkspace(junk)).toBeNull();
    // Unknown open ids are dropped; a stale active falls back to the first tab.
    const fixed = parseWorkspace(JSON.stringify({ ...ws, open: ["f9", "f2"], active: "f9" }));
    expect(fixed).toMatchObject({ open: ["f2"], active: "f2" });
  });
});

describe("presets", () => {
  test("integrity", () => {
    expect(PRESETS).toHaveLength(10);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(10);
    expect(PRESETS.some((p) => p.id === DEFAULT_PRESET)).toBe(true);
    for (const p of PRESETS) {
      const ext = p.kind === "source" ? "bpmnscript" : "bpmn";
      expect(p.file).toBe(`/playground/presets/${p.id}.${ext}`);
      expect(p.path.endsWith("." + ext)).toBe(true);
    }
  });
});
