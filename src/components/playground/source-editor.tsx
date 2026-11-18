"use client";

import { createModelReference } from "@codingame/monaco-vscode-api/monaco";
import { editor as monacoEditor, languages, MarkerSeverity, type IDisposable } from "@codingame/monaco-vscode-editor-api";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as vscode from "vscode";
import languageConfiguration from "@/generated/bpmnscript/language-configuration.json";
import monarch from "@/generated/bpmnscript/monarch.js";
import type { ConvDiagnostic } from "@/lib/playground/protocol";
import { fileUri } from "@/lib/playground/workspace";
import { ensureMonacoApi, LANGUAGE_ID } from "./bpmnscript-client";
import { followMonacoTheme } from "./monaco-theme";
import "./source-editor.css";

// Same dynamic entry as the editor, so Monaco is fetched once:
// dynamic(() => import("./source-editor").then((m) => m.BpmnscriptClientHost), { ssr: false })
export { BpmnscriptClientHost } from "./bpmnscript-client";
export type { BpmnscriptClient, LspStatus } from "./bpmnscript-client";

export type EditorApi = {
  /** The file's current text, or null if it has no model yet. */
  getValue(id: string): string | null;
  /** 1-based line and column in file `id`: once that file is shown, moves the cursor there, scrolls it into view and focuses. */
  revealPosition(id: string, line: number, col: number): void;
  focus(): void;
};

type Props = {
  /** One model per file; `text` is read only when the model is created. */
  files: readonly { id: string; text: string }[];
  /** The file shown; null shows nothing. */
  active: string | null;
  /** Server-rendered source shown until Monaco is live. */
  fallback?: ReactNode;
  onChange?: (id: string, value: string) => void;
  onReady?: (api: EditorApi) => void;
  /** Every marker on a file's model (language server diagnostics), 0-based like the compiler's. */
  onDiagnostics?: (id: string, diagnostics: ConvDiagnostic[]) => void;
  /** 1-based cursor position in the shown file. */
  onCursor?: (line: number, col: number) => void;
  /** Monaco did not start; remount the editor (a new `key`) to try again. */
  onError?: (err: unknown) => void;
};

type Doc = { id: string; ref: { dispose(): void }; model: monacoEditor.ITextModel; sub: IDisposable };

// Mounts and unmounts run one after another, so a Strict Mode remount never overlaps a start.
let lifecycle: Promise<void> = Promise.resolve();
let languageRegistered = false;

function registerLanguage() {
  if (languageRegistered) return;
  languageRegistered = true;
  languages.register({ id: LANGUAGE_ID, extensions: [".bpmnscript"], aliases: ["BPMNscript"] });
  languages.setMonarchTokensProvider(LANGUAGE_ID, monarch);
  // The file is VS Code's format: pairs as [open, close] or {open, close}, wordPattern as a regex source.
  const pair = (p: string[] | { open: string; close: string }) => (Array.isArray(p) ? { open: p[0], close: p[1] } : p);
  const c = languageConfiguration;
  languages.setLanguageConfiguration(LANGUAGE_ID, {
    comments: { lineComment: c.comments.lineComment, blockComment: c.comments.blockComment as [string, string] },
    brackets: c.brackets as [string, string][],
    autoClosingPairs: c.autoClosingPairs.map(pair),
    surroundingPairs: c.surroundingPairs.map(pair),
    wordPattern: new RegExp(c.wordPattern),
  });
}

/**
 * Monaco (classic mode) for BPMNscript with the language server's completion, hover and diagnostics.
 * Every file keeps its own model, so switching files keeps text, undo history, cursor and scroll.
 */
export default function SourceEditor({ files, active, fallback, onChange, onReady, onDiagnostics, onCursor, onError }: Props) {
  const t = useTranslations("playground.tabs");
  const hostRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const props = useRef({ files, active, onChange, onReady, onDiagnostics, onCursor, onError, label: t("sourceLabel") });
  props.current = { ...props.current, files, active, onChange, onReady, onDiagnostics, onCursor, onError };
  // Set once Monaco is up: brings the models and the shown file in line with the props.
  const sync = useRef<() => void>(() => {});

  useEffect(() => {
    const host = hostRef.current!;
    let cancelled = false;
    let ed: monacoEditor.IStandaloneCodeEditor | null = null;
    const docs = new Map<string, Doc>();
    const views = new Map<string, monacoEditor.ICodeEditorViewState | null>();
    const disposables: IDisposable[] = [];
    let shown: string | null = null;
    let stopTheme = () => {};
    let queue = Promise.resolve();
    // A position to show once its file is the shown one (the switch may still be on its way).
    let reveal: { id: string; line: number; col: number } | null = null;

    const emitDiagnostics = (doc: Doc) => {
      const markers = monacoEditor.getModelMarkers({ resource: doc.model.uri });
      props.current.onDiagnostics?.(
        doc.id,
        markers.map((m) => ({
          line: m.startLineNumber - 1,
          character: m.startColumn - 1,
          endLine: m.endLineNumber - 1,
          endCharacter: m.endColumn - 1,
          message: m.message,
          severity: m.severity === MarkerSeverity.Error ? 1 : 2,
          text: doc.model.getValueInRange(m),
        })),
      );
    };

    const reconcile = async () => {
      if (cancelled || !ed) return;
      const { files } = props.current;
      const want = new Set(files.map((f) => f.id));
      for (const [id, doc] of docs)
        if (!want.has(id)) {
          if (shown === id) {
            ed.setModel(null);
            shown = null;
          }
          doc.sub.dispose();
          doc.ref.dispose();
          docs.delete(id);
          views.delete(id);
          props.current.onDiagnostics?.(id, []);
        }
      for (const f of files) {
        if (docs.has(f.id)) continue;
        const ref = await createModelReference(vscode.Uri.parse(fileUri(f.id)), f.text);
        if (cancelled) return ref.dispose();
        ref.object.setLanguageId(LANGUAGE_ID);
        const model = ref.object.textEditorModel!;
        if (model.getValue() !== f.text) model.setValue(f.text);
        const doc: Doc = { id: f.id, ref, model, sub: model.onDidChangeContent(() => props.current.onChange?.(f.id, model.getValue())) };
        docs.set(f.id, doc);
        emitDiagnostics(doc);
      }
      const next = props.current.active;
      if (next !== shown && (!next || docs.has(next))) {
        if (shown) views.set(shown, ed.saveViewState());
        shown = next;
        ed.setModel(next ? docs.get(next)!.model : null);
        if (next) {
          const view = views.get(next);
          if (view) ed.restoreViewState(view);
          const p = ed.getPosition();
          if (p) props.current.onCursor?.(p.lineNumber, p.column);
        }
      }
      if (reveal && reveal.id === shown) {
        const at = { lineNumber: reveal.line, column: reveal.col };
        reveal = null;
        ed.setPosition(at);
        ed.revealPositionInCenterIfOutsideViewport(at);
        ed.focus();
      }
    };

    lifecycle = lifecycle
      .then(async () => {
        if (cancelled) return;
        await Promise.all([ensureMonacoApi(), document.fonts.ready]);
        if (cancelled) return;
        registerLanguage();
        const root = host.closest("[data-playground]") ?? document.documentElement;
        stopTheme = followMonacoTheme(root);
        const coarse = matchMedia("(pointer: coarse)").matches;
        ed = monacoEditor.create(host, {
          model: null,
          ariaLabel: props.current.label,
          fontFamily: getComputedStyle(root).getPropertyValue("--pg-font-mono").trim() || "monospace",
          // 16px on touch screens keeps iOS from zooming in on focus.
          fontSize: coarse ? 16 : 14,
          lineHeight: coarse ? 24 : 22,
          padding: { top: 8, bottom: 8 },
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          tabSize: 2,
          glyphMargin: false,
          folding: false,
          lineNumbersMinChars: 3,
          lineDecorationsWidth: 10,
          renderLineHighlight: "line",
          stickyScroll: { enabled: false },
          wordBasedSuggestions: "off",
          fixedOverflowWidgets: true,
          cursorSmoothCaretAnimation: "off",
          smoothScrolling: false,
          guides: { indentation: true, bracketPairs: false },
          scrollbar: { useShadows: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        });
        // Fonts finished loading before Monaco measured; this catches a late swap.
        monacoEditor.remeasureFonts();
        const editor = ed;
        disposables.push(
          editor,
          monacoEditor.onDidChangeMarkers((uris) => {
            const changed = new Set(uris.map((u) => u.toString()));
            for (const doc of docs.values()) if (changed.has(doc.model.uri.toString())) emitDiagnostics(doc);
          }),
          editor.onDidChangeCursorPosition((e) => props.current.onCursor?.(e.position.lineNumber, e.position.column)),
        );
        sync.current = () => {
          queue = queue.then(reconcile).catch((err: unknown) => console.error("SourceEditor:", err));
        };
        sync.current();
        await queue;
        if (cancelled) return;
        setMounted(true);
        props.current.onReady?.({
          getValue: (id) => docs.get(id)?.model.getValue() ?? null,
          revealPosition(id, line, col) {
            reveal = { id, line, col };
            sync.current();
          },
          focus: () => editor.focus(),
        });
      })
      .catch((err: unknown) => {
        console.error("SourceEditor:", err);
        if (!cancelled) props.current.onError?.(err);
      });

    return () => {
      cancelled = true;
      sync.current = () => {};
      lifecycle = lifecycle
        .then(async () => {
          await queue;
          stopTheme();
          for (const d of disposables) d.dispose();
          for (const doc of docs.values()) {
            doc.sub.dispose();
            doc.ref.dispose();
          }
        })
        .catch((err: unknown) => console.error("SourceEditor:", err));
    };
  }, []);

  const ids = files.map((f) => f.id).join(" ");
  useEffect(() => sync.current(), [ids, active]);

  return (
    <div className="pg-editor" data-pg-editor="" data-mounted={mounted ? "" : undefined}>
      {!mounted && fallback && <div className="pg-editor-fallback">{fallback}</div>}
      <div ref={hostRef} className="pg-editor-host" />
    </div>
  );
}
