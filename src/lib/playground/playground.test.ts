import { describe, expect, test } from "bun:test";
import { compileView, exportName, importView, shouldReportCompileError } from "./outcome";
import { DEFAULT_PRESET, PRESETS } from "./presets";
import { decodeShare, encodeShare } from "./share";
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

async function deflate(data: Uint8Array) {
  const cs = new CompressionStream("deflate-raw");
  const w = cs.writable.getWriter();
  void w.write(data as BufferSource);
  void w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

describe("share", () => {
  test("round trip with non-ASCII", async () => {
    const src = "process Prüfung {\n  start\n}\n".repeat(80);
    const e = await encodeShare(src);
    if (!e.ok) throw new Error("expected ok");
    expect(e.hash.startsWith("src=")).toBe(true);
    for (const h of [e.hash, "#" + e.hash]) {
      expect(await decodeShare(h)).toEqual({ ok: true, source: src });
    }
  });
  test("too-long", async () => {
    let seed = 1;
    const noise = Array.from({ length: 12000 }, () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return String.fromCharCode(33 + (seed % 90));
    }).join("");
    expect(await encodeShare(noise)).toEqual({ ok: false, reason: "too-long" });
  });
  test("too-large", async () => {
    const big = await deflate(new Uint8Array(300 * 1024).fill(97));
    const hash = "src=" + Buffer.from(big).toString("base64url");
    expect(await decodeShare(hash)).toEqual({ ok: false, reason: "too-large" });
  });
  test("garbage never throws", async () => {
    expect(await decodeShare("src=%%%")).toEqual({ ok: false, reason: "invalid" });
    expect(await decodeShare("src=AAAA")).toEqual({ ok: false, reason: "invalid" });
    expect(await decodeShare("src=")).toEqual({ ok: false, reason: "invalid" });
    expect(await decodeShare("")).toEqual({ ok: false, reason: "absent" });
    expect(await decodeShare("#other=1")).toEqual({ ok: false, reason: "absent" });
  });
});

describe("outcome", () => {
  const d = (line: number) => ({
    line,
    character: 0,
    endLine: line,
    endCharacter: 1,
    message: "m",
    severity: 1 as const,
    text: "t",
  });
  test("compileView", () => {
    expect(compileView({ ok: false, kind: "validation", diagnostics: [d(4), d(9)] })).toMatchObject({
      state: "error",
      errors: 2,
      firstErrorLine: 5,
    });
    expect(
      compileView({ ok: false, kind: "validation", diagnostics: [{ ...d(1), severity: 2 }, d(6)] }),
    ).toMatchObject({ errors: 1, firstErrorLine: 7 });
    expect(compileView({ ok: true, output: "<x/>", layoutWarning: "w" })).toMatchObject({
      state: "ok",
      xml: "<x/>",
      layoutWarning: "w",
      errors: 0,
    });
    expect(compileView({ ok: false, kind: "error", message: "boom" })).toMatchObject({
      state: "error",
      message: "boom",
    });
  });
  test("importView", () => {
    const w = { elementId: "a", category: "c", message: "head\nnote: n1\nhelp: h1" };
    expect(importView({ ok: true, output: "s", warnings: [w], buildErrors: [] })).toEqual({
      kind: "warning",
      source: "s",
      warnings: [{ headline: "head", notes: ["note: n1", "help: h1"] }],
    });
    expect(importView({ ok: true, output: "s", warnings: [], buildErrors: [] })).toMatchObject({
      kind: "ok",
      source: "s",
    });
    expect(importView({ ok: false, kind: "unsupported", message: "no\nnote: why" })).toMatchObject({
      kind: "refused",
      message: { headline: "no", notes: ["note: why"] },
    });
    expect(importView({ ok: false, kind: "error", message: "e" }).kind).toBe("refused");
  });
  test("shouldReportCompileError", () => {
    expect(shouldReportCompileError("pending", "error")).toBe(true);
    expect(shouldReportCompileError("ok", "error")).toBe(true);
    expect(shouldReportCompileError("error", "error")).toBe(false);
    expect(shouldReportCompileError("error", "ok")).toBe(false);
  });
  test("exportName", () => {
    expect(exportName("process loan-approval(\n", ".bpmnscript")).toBe("loan-approval.bpmnscript");
    expect(exportName('<bpmn:process id="p-1_x">', ".bpmn")).toBe("p-1_x.bpmn");
    expect(exportName("// process fake {\nprocess real(\n", ".bpmnscript")).toBe("real.bpmnscript");
    expect(exportName('<!-- process x -->\n<bpmn:process id="p">', ".bpmn")).toBe("p.bpmn");
    expect(exportName("nothing", ".bpmn")).toBe("process.bpmn");
    expect(exportName("process a/b {", ".bpmn")).toBe("a_b.bpmn");
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
      expect(p.upstreamPath.endsWith("." + ext)).toBe(true);
    }
  });
});
