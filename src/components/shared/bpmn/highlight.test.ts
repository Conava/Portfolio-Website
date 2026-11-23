import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { highlight } from "./highlight";
import { INVOICE_SOURCE, INVOICE_XML, STEP_OF_LINE } from "./invoice-approval";

describe("highlight", () => {
  const lines = highlight(INVOICE_SOURCE);
  const flat = lines.flat();

  test("round trip", () => {
    expect(lines.map((l) => l.map((t) => t.text).join("")).join("\n")).toBe(INVOICE_SOURCE);
    const odd = '// c\nwhile (x >= 2.5) { script "a\\"b" }\n\t';
    expect(highlight(odd).map((l) => l.map((t) => t.text).join("")).join("\n")).toBe(odd);
  });

  test("token kinds", () => {
    expect(flat.find((t) => t.text === "process")?.kind).toBe("kw");
    expect(flat.find((t) => t.text === "invoice-approval")?.kind).toBe("name");
    expect(flat.find((t) => t.text === '"Invoice amount"')?.kind).toBe("str");
    expect(flat.find((t) => t.text === "1000")?.kind).toBe("num");
    expect(highlight("// hi")[0][0].kind).toBe("comment");
  });

  test("goto is a keyword followed by its target's name", () => {
    expect(highlight("goto CheckPolicy")[0].filter((t) => t.kind !== "plain")).toEqual([
      { text: "goto", kind: "kw" },
      { text: "CheckPolicy", kind: "name" },
    ]);
  });
});

describe("invoice sample", () => {
  test("matches the site content sample", () => {
    const { sample } = JSON.parse(readFileSync("content/en/data/bpmnscript.json", "utf8"));
    expect(sample.trim()).toBe(INVOICE_SOURCE.trim());
    expect(STEP_OF_LINE.length).toBe(INVOICE_SOURCE.split("\n").length);
  });

  test("XML is the compiled output of the same process", () => {
    expect(INVOICE_XML).toContain('<bpmn:process id="invoice-approval"');
    expect(INVOICE_XML).toContain('exporterVersion="0.1.1"');
  });
});
