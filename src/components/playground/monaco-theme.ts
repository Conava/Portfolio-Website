import { editor } from "@codingame/monaco-vscode-editor-api";

let probe: CanvasRenderingContext2D | null = null;

/** Any CSS color as #rrggbb (Monaco themes take hex only). */
function hex(css: string): string {
  probe ??= document.createElement("canvas").getContext("2d");
  if (!probe) return css;
  probe.fillStyle = "#000";
  probe.fillStyle = css;
  return probe.fillStyle;
}

/**
 * Builds a Monaco theme from the playground tokens on `root` and activates it.
 * Token types are the ones the generated BPMNscript Monarch grammar emits.
 */
export function applyMonacoTheme(root: Element) {
  const cs = getComputedStyle(root);
  const v = (name: string) => hex(cs.getPropertyValue(name).trim());
  const dark = document.documentElement.classList.contains("dark");
  const t = {
    bg: v("--pg-bg"),
    panel: v("--pg-panel"),
    raised: v("--pg-raised"),
    line: v("--pg-line"),
    line2: v("--pg-line-2"),
    text: v("--pg-text"),
    text2: v("--pg-text-2"),
    mute: v("--pg-mute"),
    error: v("--pg-error"),
    warn: v("--pg-warn"),
    accent: v("--pg-accent"),
  };
  const fg = (c: string) => c.slice(1);
  const name = dark ? "pg-dark" : "pg-light";

  editor.defineTheme(name, {
    base: dark ? "vs-dark" : "vs",
    inherit: false,
    rules: [
      { token: "", foreground: fg(t.text) },
      { token: "keyword", foreground: fg(t.text), fontStyle: "bold" },
      { token: "ID", foreground: fg(t.text) },
      { token: "QUOTED_NAME", foreground: fg(t.text) },
      { token: "string", foreground: fg(t.text2) },
      { token: "RAW_TEMPLATE", foreground: fg(t.text2) },
      { token: "FENCED_SCRIPT", foreground: fg(t.text2) },
      { token: "number", foreground: fg(t.accent) },
      { token: "comment", foreground: fg(t.mute) },
      { token: "operator", foreground: fg(t.text2) },
      { token: "white", foreground: fg(t.text) },
    ],
    colors: {
      "editor.background": t.panel,
      "editor.foreground": t.text,
      "editorCursor.foreground": t.accent,
      "editor.selectionBackground": `${t.accent}40`,
      "editor.inactiveSelectionBackground": `${t.accent}26`,
      "editor.selectionHighlightBackground": `${t.accent}1a`,
      "editor.wordHighlightBackground": `${t.line2}66`,
      "editor.wordHighlightStrongBackground": `${t.line2}66`,
      "editor.findMatchBackground": `${t.warn}55`,
      "editor.findMatchHighlightBackground": `${t.warn}2a`,
      "editor.lineHighlightBackground": t.bg,
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": t.mute,
      "editorLineNumber.activeForeground": t.text,
      "editorGutter.background": t.panel,
      "editorIndentGuide.background1": t.line,
      "editorIndentGuide.activeBackground1": t.line2,
      "editorWhitespace.foreground": t.line2,
      "editorBracketMatch.background": "#00000000",
      "editorBracketMatch.border": t.line2,
      "editorError.foreground": t.error,
      "editorWarning.foreground": t.warn,
      "editorInfo.foreground": t.mute,
      "editorOverviewRuler.border": "#00000000",
      "editorOverviewRuler.errorForeground": t.error,
      "editorOverviewRuler.warningForeground": t.warn,
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": `${t.line2}99`,
      "scrollbarSlider.hoverBackground": t.line2,
      "scrollbarSlider.activeBackground": t.mute,
      focusBorder: t.accent,
      foreground: t.text,
      "widget.shadow": "#00000000",
      "editorWidget.background": t.raised,
      "editorWidget.foreground": t.text,
      "editorWidget.border": t.line2,
      "editorHoverWidget.background": t.raised,
      "editorHoverWidget.foreground": t.text,
      "editorHoverWidget.border": t.line2,
      "editorHoverWidget.statusBarBackground": t.bg,
      "editorSuggestWidget.background": t.raised,
      "editorSuggestWidget.foreground": t.text,
      "editorSuggestWidget.border": t.line2,
      "editorSuggestWidget.selectedBackground": t.bg,
      "editorSuggestWidget.selectedForeground": t.text,
      "editorSuggestWidget.highlightForeground": t.accent,
      "editorSuggestWidget.focusHighlightForeground": t.accent,
      "list.hoverBackground": t.bg,
      "list.activeSelectionBackground": t.bg,
      "list.activeSelectionForeground": t.text,
      "list.focusOutline": t.accent,
      "list.highlightForeground": t.accent,
      "input.background": t.panel,
      "input.foreground": t.text,
      "input.border": t.line2,
      "inputOption.activeBorder": t.accent,
      "textLink.foreground": t.accent,
      "textLink.activeForeground": t.accent,
      "textCodeBlock.background": t.bg,
      "editorLink.activeForeground": t.accent,
    },
  });
  editor.setTheme(name);
}

/** Applies the theme now and again whenever the color mode changes. */
export function followMonacoTheme(root: Element): () => void {
  applyMonacoTheme(root);
  const mo = new MutationObserver(() => applyMonacoTheme(root));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}
