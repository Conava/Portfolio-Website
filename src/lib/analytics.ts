declare global {
  interface Window {
    umami?: {
      track(name: string, data?: Record<string, string | number>): void;
    };
  }
}

export type Dwell = "1-5s" | "5-15s" | "15-60s" | "60s+";

/** Every tracked event and its properties. Add new events here first. */
export interface EventMap {
  section_view: { section: string; dwell: Dwell };
  /** Also serves as article read progress (the URL identifies the article). */
  scroll_depth: { depth: 25 | 50 | 75 | 100 };
  panel_open: { panel: string; section: string };
  panel_close: { panel: string; section: string };
  outbound_click: { host: string; url: string; label: string; section: string };
  resume_download: { section: string };
  email_click: { section: string };
  email_copy: { section: string };
  design_toggle: { from: string; to: string; via: "header" | "footer" | "menu" };
  locale_switch: { from: string; to: string };
  color_mode: { to: "dark" | "light" };
  playground_preset: { preset: string };
  playground_import: {
    result: "ok" | "warning" | "refused";
    source: "file" | "drop" | "preset";
    preset?: string;
  };
  playground_compile_error: { errors: number };
  playground_export: { format: "bpmn" | "bpmnscript" };
  playground_share: Record<string, never>;
}

/** No-op on the server or without the Umami script; never throws. */
export function trackEvent<K extends keyof EventMap>(
  name: K,
  data: EventMap[K]
): void {
  try {
    if (typeof window !== "undefined") {
      window.umami?.track(name, data as Record<string, string | number>);
    }
  } catch {
    // analytics must never break the page
  }
}

/** Dwell time bucket; under 1 s is not worth sending. */
export function dwellBucket(ms: number): Dwell | null {
  if (ms < 1000) return null;
  if (ms < 5000) return "1-5s";
  if (ms < 15000) return "5-15s";
  if (ms < 60000) return "15-60s";
  return "60s+";
}

export const truncate = (s: string, n: number) => s.slice(0, n);

export function classifyClick(
  href: string,
  pageOrigin: string
):
  | { name: "outbound_click"; host: string; url: string }
  | { name: "resume_download" }
  | { name: "email_click" }
  | null {
  if (/^mailto:/i.test(href)) return { name: "email_click" };
  let u: URL;
  try {
    u = new URL(href, pageOrigin);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.origin === new URL(pageOrigin).origin) {
    return u.pathname === "/resume.pdf" ? { name: "resume_download" } : null;
  }
  return { name: "outbound_click", host: u.host, url: truncate(u.href, 500) };
}

/** Id of the closest section[id], else header/footer landmark, else "page". */
export function sectionOf(el: Element | null): string {
  const s = el?.closest("section[id]");
  if (s) return s.id;
  if (el?.closest("header")) return "header";
  if (el?.closest("footer")) return "footer";
  return "page";
}
