// Not in detail-panel.tsx: a "use client" module would hand the server a reference, not the string.
/**
 * Inline, before the first paint: a deep-linked panel (`#panel-<id>`) is already open in the
 * first frame instead of opening at hydration and pushing the page down. Mirrors the open state's
 * attributes; DetailPanel takes over on mount.
 */
export const PANEL_HASH_SCRIPT = `(()=>{var h=location.hash;if(h.indexOf("#panel-"))return;var r=document.getElementById(h.slice(1));if(!r||!r.classList.contains("dp-region"))return;r.setAttribute("data-state","open");r.setAttribute("data-seen","");r.setAttribute("data-instant","");var d=r.querySelector("details");if(d)d.open=true})()`;
