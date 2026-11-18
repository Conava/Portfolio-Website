/**
 * Keeps the reader's place across the design and locale toggles, which are
 * full-document navigations (plain anchors, so they work without JS).
 *
 * A locale click stores the section crossing the viewport middle; the next
 * page scrolls back to it. A design click opens the next design at the top. Only design-toggle navigations keep the native
 * cross-document View Transition (see controls.css); every other one skips it.
 */
const KEY = "nav-continuity";
// ponytail: a mark older than this belongs to a navigation that never happened
const MAX_AGE_MS = 10_000;

type Entry = { section: string | null; offset: number; crossfade: boolean; at: number };
type Click = Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

let installed = false;

function read(): Entry | null {
  try {
    const e = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Entry | null;
    return e && Date.now() - e.at < MAX_AGE_MS ? e : null;
  } catch {
    return null;
  }
}

/**
 * Call from the toggle's click handler; never prevents the navigation.
 * `keepPlace: false` makes the next page start at the top.
 */
export function markNavigation(e: Click, crossfade: boolean, keepPlace = true) {
  // New tab or window: this page stays, nothing to continue.
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const mid = innerHeight / 2;
  // Innermost section spanning the middle line (later in document order = deeper).
  const section = keepPlace
    ? [...document.querySelectorAll("section[id]")].findLast((s) => {
        const r = s.getBoundingClientRect();
        return r.top <= mid && r.bottom > mid;
      })
    : undefined;
  const entry: Entry = {
    section: section?.id ?? null,
    offset: section ? section.getBoundingClientRect().top : 0,
    crossfade,
    at: Date.now(),
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // storage disabled: the navigation still works, just without continuity
  }
}

/** Once per document: skip non-toggle transitions, restore a stored position. */
export function installNavContinuity() {
  if (installed) return;
  installed = true;

  addEventListener("pageswap", (e) => {
    if (!read()?.crossfade) (e as PageSwapEvent).viewTransition?.skipTransition();
  });

  const entry = read();
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
  // A hash wins: the browser already scrolled to it.
  if (!entry || location.hash) return;
  if (!entry.section) {
    scrollTo({ top: 0, behavior: "instant" });
    return;
  }
  const el = document.getElementById(entry.section);
  if (!el) return; // e.g. came from a project page
  scrollTo({ top: el.getBoundingClientRect().top + scrollY - entry.offset, behavior: "instant" });
}
