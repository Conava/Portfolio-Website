import { afterEach, describe, expect, test } from "bun:test";
import { classifyClick, dwellBucket, trackEvent } from "./analytics";

const g = globalThis as unknown as { window?: unknown };
afterEach(() => {
  delete g.window;
});

describe("trackEvent", () => {
  test("no-ops without window", () => {
    expect(() => trackEvent("email_click", { section: "x" })).not.toThrow();
  });
  test("no-ops without umami", () => {
    g.window = {};
    expect(() => trackEvent("email_click", { section: "x" })).not.toThrow();
  });
  test("calls umami.track once", () => {
    const calls: unknown[][] = [];
    g.window = { umami: { track: (...a: unknown[]) => calls.push(a) } };
    trackEvent("email_click", { section: "hero" });
    expect(calls).toEqual([["email_click", { section: "hero" }]]);
  });
  test("never throws when umami throws", () => {
    g.window = {
      umami: {
        track: () => {
          throw new Error("boom");
        },
      },
    };
    expect(() => trackEvent("email_click", { section: "x" })).not.toThrow();
  });
  test("sends playground_import with preset unchanged", () => {
    const calls: unknown[][] = [];
    g.window = { umami: { track: (...a: unknown[]) => calls.push(a) } };
    const data = { result: "ok", source: "preset", preset: "invoice-receipt" } as const;
    trackEvent("playground_import", data);
    expect(calls).toEqual([["playground_import", data]]);
  });
});

test("dwellBucket boundaries", () => {
  expect(dwellBucket(999)).toBeNull();
  expect(dwellBucket(1000)).toBe("1-5s");
  expect(dwellBucket(5000)).toBe("5-15s");
  expect(dwellBucket(15000)).toBe("15-60s");
  expect(dwellBucket(60000)).toBe("60s+");
});

describe("classifyClick", () => {
  const o = "https://marlonkranz.com";
  test("outbound", () => {
    expect(classifyClick("https://github.com/Conava", o)).toEqual({
      name: "outbound_click",
      host: "github.com",
      url: "https://github.com/Conava",
    });
  });
  test("resume", () => {
    expect(classifyClick("/resume.pdf", o)).toEqual({ name: "resume_download" });
    expect(classifyClick("https://marlonkranz.com/resume.pdf", o)).toEqual({
      name: "resume_download",
    });
  });
  test("email", () => {
    expect(classifyClick("mailto:x@y", o)).toEqual({ name: "email_click" });
    expect(classifyClick("MAILTO:x@y", o)).toEqual({ name: "email_click" });
  });
  test("internal and hash are null", () => {
    expect(classifyClick("/projects/minj", o)).toBeNull();
    expect(classifyClick("#about", o)).toBeNull();
  });
  test("truncates url to 500", () => {
    const r = classifyClick("https://a.com/" + "x".repeat(600), o);
    expect(r && "url" in r && r.url.length).toBe(500);
  });
});
