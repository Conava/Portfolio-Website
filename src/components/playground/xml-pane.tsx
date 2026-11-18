"use client";

import { tabId } from "./mobile-tabs";

/** The compiled BPMN XML, read-only; scrolls inside its box. */
export function XmlPane({ xml }: { xml: string }) {
  return (
    // Focusable so the keyboard can scroll it.
    <pre className="pg-xml" id="pg-pane-xml" role="tabpanel" aria-labelledby={tabId("pane", "xml")} tabIndex={0} lang="en">
      <code>{xml}</code>
    </pre>
  );
}
