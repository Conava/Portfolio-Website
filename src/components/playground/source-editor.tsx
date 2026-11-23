"use client";

import { getService, IKeybindingService } from "@codingame/monaco-vscode-api";
import { editor as monacoEditor, type IDisposable } from "@codingame/monaco-vscode-editor-api";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { modelUri } from "@/generated/bpmnscript/editor/language";
import {
  createBpmnscriptEditor,
  followMonacoTheme,
  modelDiagnostics,
  openBpmnscriptModel,
  registerBpmnscriptLanguage,
} from "@/generated/bpmnscript/editor/monaco";
import type { ConvDiagnostic } from "@/generated/bpmnscript/editor/protocol";
import languageConfiguration from "@/generated/bpmnscript/language-configuration.json";
import monarch from "@/generated/bpmnscript/monarch.js";
import { ensureMonacoApi } from "./bpmnscript-client";
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
  /** Every key label Monaco binds to a command on this platform (e.g. ["Ctrl+Shift+P", "F1"]). */
  keybindings(commandId: string): string[];
};

type Props = {
  /** One model per file; `text` is read only when the model is created. */
  files: readonly { id: string; name: string; text: string }[];
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

type Doc = { id: string; uri: string; ref: { dispose(): void }; model: monacoEditor.ITextModel; sub: IDisposable };

// Mounts and unmounts run one after another, so a Strict Mode remount never overlaps a start.
let lifecycle: Promise<void> = Promise.resolve();

/**
 * Monaco (classic mode) for BPMNscript with the language server's completion, hover and diagnostics.
 * Every file keeps its own model, so switching files keeps text, undo history, cursor and scroll.
 * The model URI is the file name, so a rename swaps the model: text, cursor and scroll stay, undo does not.
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

    const emitDiagnostics = (doc: Doc) => props.current.onDiagnostics?.(doc.id, modelDiagnostics(doc.model));

    const reconcile = async () => {
      if (cancelled || !ed) return;
      const { files } = props.current;
      const want = new Map(files.map((f) => [f.id, modelUri(f.name)]));
      for (const [id, doc] of docs) {
        const uri = want.get(id);
        if (uri === doc.uri) continue;
        if (shown === id) {
          // A rename keeps the view state for the new model.
          if (uri) views.set(id, ed.saveViewState());
          ed.setModel(null);
          shown = null;
        }
        doc.sub.dispose();
        doc.ref.dispose();
        docs.delete(id);
        if (!uri) views.delete(id);
        props.current.onDiagnostics?.(id, []);
      }
      for (const f of files) {
        if (docs.has(f.id)) continue;
        const uri = modelUri(f.name);
        const { ref, model } = await openBpmnscriptModel(f.name, f.text);
        if (cancelled) return ref.dispose();
        const doc: Doc = { id: f.id, uri, ref, model, sub: model.onDidChangeContent(() => props.current.onChange?.(f.id, model.getValue())) };
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
        registerBpmnscriptLanguage({ monarch, languageConfiguration });
        const root = host.closest("[data-playground]") ?? document.documentElement;
        stopTheme = followMonacoTheme(root);
        ed = await createBpmnscriptEditor(host, {
          ariaLabel: props.current.label,
          fontFamily: getComputedStyle(root).getPropertyValue("--pg-font-mono").trim() || "monospace",
        });
        const editor = ed;
        const keys = await getService(IKeybindingService);
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
          keybindings: (id) => keys.lookupKeybindings(id).flatMap((k) => k.getLabel() ?? []),
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

  const ids = files.map((f) => `${f.id}/${f.name}`).join(" ");
  useEffect(() => sync.current(), [ids, active]);

  return (
    <div className="pg-editor" data-pg-editor="" data-mounted={mounted ? "" : undefined}>
      {!mounted && fallback && <div className="pg-editor-fallback">{fallback}</div>}
      <div ref={hostRef} className="pg-editor-host" />
    </div>
  );
}
