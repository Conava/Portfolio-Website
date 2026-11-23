// Drives the real built BPMNscript worker over raw JSON-RPC in a Bun module worker.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../../messages/en.json";
import { INVOICE_SOURCE } from "../../components/shared/bpmn/invoice-approval";
import { PRESETS } from "./presets";
import { COMPILE_METHOD, DECOMPILE_METHOD, type CompileResult, type DecompileResult } from "@/generated/bpmnscript/editor/protocol";
import { newFileText } from "./workspace";

const PUBLIC = join(import.meta.dir, "../../../public");
const WORKER = join(PUBLIC, "playground/bpmnscript/server-worker.js");
const preset = (id: string) => {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return readFileSync(join(PUBLIC, p.file), "utf8");
};

type Message = { id?: number; method?: string; params?: any; result?: any; error?: unknown };

let worker: Worker;
let nextId = 1;
const pending = new Map<number, (m: Message) => void>();
const notes: Message[] = [];

function request<T>(method: string, params: unknown): Promise<T> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result as T)));
    worker.postMessage({ jsonrpc: "2.0", id, method, params });
  });
}
const notify = (method: string, params: unknown) => worker.postMessage({ jsonrpc: "2.0", method, params });

async function waitFor(match: (m: Message) => boolean, ms = 10_000): Promise<Message> {
  const end = Date.now() + ms;
  for (;;) {
    const hit = notes.find(match);
    if (hit) return hit;
    if (Date.now() > end) throw new Error("timed out waiting for a notification");
    await Bun.sleep(20);
  }
}

beforeAll(async () => {
  if (!existsSync(WORKER)) throw new Error(`${WORKER} is missing: run \`bun run playground:assets\``);
  worker = new Worker(WORKER, { type: "module" });
  worker.onmessage = (e: MessageEvent<Message>) => {
    const m = e.data;
    if (m.method === undefined && m.id !== undefined) {
      pending.get(m.id)?.(m);
      pending.delete(m.id);
    } else if (m.method !== undefined && m.id !== undefined) {
      // Server-to-client request (registerCapability, configuration): answer with nothing.
      const result = m.method === "workspace/configuration" ? m.params.items.map(() => null) : null;
      worker.postMessage({ jsonrpc: "2.0", id: m.id, result });
    } else notes.push(m);
  };
  await request("initialize", { processId: null, rootUri: null, capabilities: {}, workspaceFolders: null });
  notify("initialized", {});
}, 20_000);

afterAll(() => worker?.terminate());

describe("BPMNscript worker", () => {
  test("invalid script gets diagnostics", async () => {
    const uri = "file:///bad.bpmnscript";
    notify("textDocument/didOpen", { textDocument: { uri, languageId: "bpmn-script", version: 1, text: "process p {\n  bogus\n}" } });
    const m = await waitFor((n) => n.method === "textDocument/publishDiagnostics" && n.params.uri === uri && n.params.diagnostics.length > 0);
    expect(m.params.diagnostics.length).toBeGreaterThanOrEqual(1);
  });

  test("completion offers service", async () => {
    const uri = "file:///complete.bpmnscript";
    notify("textDocument/didOpen", { textDocument: { uri, languageId: "bpmn-script", version: 1, text: "process p {\n  start S\n  \n}" } });
    const r = await request<any>("textDocument/completion", { textDocument: { uri }, position: { line: 2, character: 2 } });
    const items: { label: string }[] = Array.isArray(r) ? r : r.items;
    expect(items.map((i) => i.label)).toContain("service");
  });

  test("compiles the invoice-approval preset", async () => {
    const r = await request<CompileResult>(COMPILE_METHOD, { source: preset("invoice-approval") });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.output).toContain("<bpmn:definitions");
    expect(r.output).toContain('<bpmn:process id="invoice-approval"');
  });

  test("a new file compiles as it starts", async () => {
    const r = await request<CompileResult>(COMPILE_METHOD, { source: newFileText("untitled-2.bpmnscript") });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.output).toContain('<bpmn:process id="untitled-2"');
  });

  test("refuses error-start", async () => {
    const r = await request<DecompileResult>(DECOMPILE_METHOD, { xml: preset("error-start") });
    expect(r).toMatchObject({ ok: false, kind: "unsupported" });
  });

  test("imports invoice-receipt with warnings", async () => {
    const r = await request<DecompileResult>(DECOMPILE_METHOD, { xml: preset("invoice-receipt") });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("presets", () => {
  // The playground is English only.
  test("every preset has a label", () => {
    for (const { id } of PRESETS) expect((en.playground.presets.labels as Record<string, string>)[id]).toBeString();
  });

  test("the copied invoice-approval preset matches the homepage sample", () => {
    // The homepage sample drops the leading comment block (only that) and puts `form` on one line.
    const norm = (s: string) => s.replace(/^(?:[ \t]*\/\/.*\n)+/, "").replace(/\s+/g, " ").trim();
    expect(norm(preset("invoice-approval"))).toBe(norm(INVOICE_SOURCE));
  });
});
