"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { isCompileShortcut } from "@/generated/bpmnscript/editor/language";
import type { ConvDiagnostic } from "@/generated/bpmnscript/editor/protocol";
import { trackEvent } from "@/lib/analytics";
import type { Design } from "@/lib/design-values";
import { compileView, exportName, importView, shouldReportCompileError, type ImportView, type Message } from "@/lib/playground/outcome";
import { PRESETS, type Preset } from "@/lib/playground/presets";
import { decodeShare, encodeShare } from "@/lib/playground/share";
import {
  activate,
  cleanName,
  closeTab,
  cycleTab,
  defaultWorkspace,
  deleteFile,
  editFile,
  EXT,
  isDirty,
  newFileText,
  openText,
  parseWorkspace,
  renameFile,
  saveFile,
  STORAGE_KEY,
  uniqueName,
  type RenameError,
  type Workspace,
} from "@/lib/playground/workspace";
import { BottomPanel, type PanelTab } from "./bottom-panel";
import { EditorTabs } from "./editor-tabs";
import { Explorer, NEW_FILE } from "./explorer";
import type { ExportFormat } from "./export-menu";
import { COMPILE_RESULT_MS, PlaygroundHeader, SHARE_COPIED_MS, type CompileButtonState, type ShareState } from "./header";
import { ImportBanner } from "./import-banner";
import { MobileTabs, tabId, type PaneTab } from "./mobile-tabs";
import { PlaygroundShortcutList, ShortcutsDialog } from "./shortcuts";
import type { BpmnscriptClient, EditorApi, LspStatus } from "./source-editor";
import { StatusBar, type CompileState } from "./status-bar";
import { XmlPane } from "./xml-pane";
import "./diagram-pane.css";
import "./layout.css";
import "./playground.css";
import "./source-editor.css";

// The server's resting frame, shown by the dynamic placeholders until each library is live.
const Fallbacks = createContext<{ editor: ReactNode; diagram: ReactNode }>({ editor: null, diagram: null });

function EditorLoading() {
  return (
    <div className="pg-editor" data-pg-editor="">
      <div className="pg-editor-fallback">{useContext(Fallbacks).editor}</div>
    </div>
  );
}
function DiagramLoading() {
  return (
    <div className="pg-diagram" data-pg-diagram="">
      <div className="pg-diagram-fallback">{useContext(Fallbacks).diagram}</div>
    </div>
  );
}

// Both from the same module entry, so Monaco is downloaded once.
const SourceEditor = dynamic(() => import("./source-editor"), { ssr: false, loading: EditorLoading });
const ClientHost = dynamic(() => import("./source-editor").then((m) => m.BpmnscriptClientHost), { ssr: false });
const DiagramPane = dynamic(() => import("./diagram-pane").then((m) => m.DiagramPane), {
  ssr: false,
  loading: DiagramLoading,
});

const DEFAULT_NAME = "invoice-approval" + EXT;
const DEBOUNCE_MS = 300;
const MAX_IMPORT = 2 * 1024 * 1024;
const PHONE = "(max-width: 899.98px)";

type Compile = { state: CompileState; seq: number; errors: number; firstErrorLine?: number };
type Good = { source: string; xml: string };

/** A promise for a value that arrives later (and can be replaced, e.g. a remounted client). */
function useLater<T>() {
  const value = useRef<T | null>(null);
  const waiters = useRef<((v: T) => void)[]>([]);
  return {
    now: () => value.current,
    set(v: T | null) {
      value.current = v;
      if (v) for (const w of waiters.current.splice(0)) w(v);
    },
    get: (): Promise<T> =>
      value.current ? Promise.resolve(value.current) : new Promise((r) => waiters.current.push(r)),
  };
}

function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // Safari starts the download late
}

// Storage can be full, disabled or blocked (private mode, sandboxed iframes): the playground still works without it.
function loadStored(): Workspace | null {
  try {
    return parseWorkspace(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}
function store(ws: Workspace) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
  } catch {}
}

/** The playground controller: files, editor, worker, compile loop, import, export, share, shortcuts. */
export function PlaygroundApp({
  initialSource,
  initialXml,
  fallbackEditor,
  fallbackDiagram,
  version,
  design,
  children,
}: {
  initialSource: string;
  initialXml: string;
  fallbackEditor: ReactNode;
  fallbackDiagram: ReactNode;
  version: string;
  design: Design;
  /** Rendered at the end of <main> (the no-JS note). */
  children?: ReactNode;
}) {
  const t = useTranslations("playground");
  const client = useLater<BpmnscriptClient>();
  const editor = useLater<EditorApi>();
  const [ws, setWs] = useState<Workspace>(() => defaultWorkspace(DEFAULT_NAME, initialSource));
  // Updates go through the ref first, so handlers that run before the next render see them.
  const wsRef = useRef(ws);
  const update = (fn: (w: Workspace) => Workspace) => {
    wsRef.current = fn(wsRef.current);
    setWs(wsRef.current);
  };
  // False until the stored workspace and a share link are applied; the editor starts after that.
  const [loaded, setLoaded] = useState(false);
  const [lsp, setLsp] = useState<LspStatus>("starting");
  const [compile, setCompile] = useState<Compile>({ state: "pending", seq: 0, errors: 0 });
  const compileState = useRef<CompileState>("pending");
  const [goods, setGoods] = useState<Record<string, Good>>({ f1: { source: initialSource, xml: initialXml } });
  const [diags, setDiags] = useState<Record<string, ConvDiagnostic[]>>({});
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [outcome, setOutcome] = useState<ImportView | null>(null);
  const [importLog, setImportLog] = useState<Message[]>([]);
  const [importing, setImporting] = useState(false);
  // null until mounted: the server frame follows the viewport through CSS (open on desktop, closed on phones).
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const [explorerOpen, setExplorerOpen] = useState<boolean | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [layoutWarning, setLayoutWarning] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("problems");
  const [tab, setTab] = useState<PaneTab>("source");
  const [shareState, setShareState] = useState<ShareState>("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [compileBtn, setCompileBtn] = useState<{ state: CompileButtonState; errors: number }>({ state: "idle", errors: 0 });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editorFailed, setEditorFailed] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const shareTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const compileTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inflight = useRef<{ id: string; text: string } | null>(null);
  const requested = useRef(0);
  const compiledId = useRef<string | null>(null);
  const importSeq = useRef(0);

  const active = ws.files.find((f) => f.id === ws.active) ?? null;
  const empty = !!active && !active.text.trim();
  const good = active ? goods[active.id] : undefined;
  const isPhone = () => matchMedia(PHONE).matches;

  /** Compiles `text` as file `id`; resolves to the result, or null when there was nothing to compile or it was superseded. */
  async function runCompile(id: string, text: string) {
    const seq = ++requested.current;
    if (!text.trim()) {
      // Nothing to compile; the diagram keeps the last good version.
      compileState.current = "pending";
      setCompile((c) => ({ state: "pending", seq: c.seq + 1, errors: 0 }));
      return null;
    }
    let r;
    try {
      r = await (await client.get()).compile(text);
    } catch {
      return null; // the worker is down; the status bar says so and Retry recompiles
    }
    if (seq !== requested.current) return null; // a newer edit or another file is on its way
    const v = compileView(r);
    if (shouldReportCompileError(compileState.current, v.state)) trackEvent("playground_compile_error", { errors: v.errors });
    compileState.current = v.state;
    setCompile((c) => ({ state: v.state, seq: c.seq + 1, errors: v.errors, firstErrorLine: v.firstErrorLine }));
    if (v.state === "ok") {
      setLayoutWarning(v.layoutWarning ?? null);
      setGoods((g) => ({ ...g, [id]: { source: text, xml: v.xml! } }));
    }
    return v;
  }

  // The Compile button and Ctrl/Cmd+Enter: compile now (live compile also runs while typing) and show
  // the result: errors open the Problems panel, success on a phone switches to the diagram.
  async function compileNow() {
    const id = wsRef.current.active;
    const text = activeSource();
    if (!id || text == null) return;
    clearTimeout(compileTimer.current);
    setCompileBtn((b) => ({ ...b, state: "busy" }));
    inflight.current = { id, text };
    const v = await runCompile(id, text).finally(() => (inflight.current = null));
    if (!v) return setCompileBtn((b) => ({ ...b, state: "idle" }));
    setCompileBtn({ state: v.state, errors: v.errors });
    compileTimer.current = setTimeout(() => setCompileBtn((b) => ({ ...b, state: "idle" })), COMPILE_RESULT_MS);
    if (v.state === "error") {
      setPanelTab("problems");
      setPanelOpen(true);
    } else if (isPhone()) setTab("diagram");
  }

  // The diagram follows the open file: compile right away on a switch, after a pause while typing.
  const activeText = active?.text;
  useEffect(() => {
    if (!loaded || lsp !== "ready" || !ws.active || activeText == null) return;
    const id = ws.active;
    const switched = compiledId.current !== id;
    compiledId.current = id;
    const timer = setTimeout(() => {
      // An explicit compile of this exact text is on its way; superseding it would swallow its result.
      if (inflight.current?.id === id && inflight.current.text === activeText) return;
      void runCompile(id, activeText);
    }, switched ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [loaded, lsp, ws.active, activeText]);

  // Restore the stored files; a share link opens as one more file.
  useEffect(() => {
    let w = loadStored() ?? wsRef.current;
    void decodeShare(location.hash).then((d) => {
      if (d.ok) w = openText(w, exportName(d.source, EXT), d.source).ws;
      else if (d.reason !== "absent") setNotice(t("share.invalid"));
      update(() => w);
      // The server's diagram belongs to the default example only.
      if (w.files.find((f) => f.id === "f1")?.text !== initialSource) setGoods({});
      setLoaded(true);
    });
    const phone = isPhone();
    setPanelOpen(!phone);
    setExplorerOpen(!phone);
    const flush = () => store(wsRef.current);
    addEventListener("pagehide", flush);
    return () => {
      removeEventListener("pagehide", flush);
      clearTimeout(shareTimer.current);
      clearTimeout(compileTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => store(ws), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [ws, loaded]);

  // Phones: an opened drawer takes focus (the open file's row), so the keyboard lands in it.
  useEffect(() => {
    if (!explorerOpen || renaming || !isPhone()) return;
    document.querySelector<HTMLElement>("[data-pg-explorer] .pg-xrow[aria-current], [data-pg-explorer] .pg-xrow")?.focus();
  }, [explorerOpen]);

  function onClient(c: BpmnscriptClient | null) {
    client.set(c);
    if (!c) return;
    setLsp(c.status);
    c.onStatus(setLsp);
  }

  function openFile(name: string, text: string) {
    update((w) => openText(w, name, text).ws);
    setTab("source");
    // Examples and imports start in the explorer: on a phone its drawer makes way for the new file.
    if (isPhone()) setExplorerOpen(false);
  }

  function onChange(id: string, text: string) {
    update((w) => editFile(w, id, text));
    setNotice(null);
    setShareState((s) => (s === "too-long" ? "idle" : s));
  }

  async function onPreset(p: Preset) {
    // Claimed at the click: a later pick or import wins even if this fetch is slower.
    const seq = ++importSeq.current;
    const res = await fetch(p.file).catch(() => null);
    if (seq !== importSeq.current) return;
    if (!res?.ok) return setNotice(t("presets.failed"));
    const text = await res.text();
    if (seq !== importSeq.current) return;
    if (p.kind === "bpmn") return importXml(text, p.id + EXT, "preset", p.id, seq);
    setOutcome(null);
    setImporting(false);
    openFile(p.id + EXT, text);
    trackEvent("playground_preset", { preset: p.id });
  }

  function refuse(message: string, src: "file" | "drop") {
    setOutcome({ kind: "refused", warnings: [], message: { headline: message, notes: [] }, local: true });
    trackEvent("playground_import", { result: "refused", source: src });
  }

  async function importFile(file: File, src: "file" | "drop") {
    // Claimed before the read: a preset picked meanwhile wins. A superseded import leaves `importing` to its superseder.
    const seq = ++importSeq.current;
    if (file.size > MAX_IMPORT) return refuse(t("import.tooLarge"), src);
    let xml: string;
    try {
      xml = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    } catch {
      if (seq === importSeq.current) refuse(t("import.notText"), src);
      return;
    }
    if (seq !== importSeq.current) return;
    await importXml(xml, file.name.replace(/\.(bpmn|xml)$/i, "") + EXT, src, undefined, seq);
  }

  async function importXml(xml: string, name: string, src: "file" | "drop" | "preset", preset?: string, seq = ++importSeq.current) {
    setImporting(true);
    let v: ImportView;
    try {
      v = importView(await (await client.get()).decompile(xml));
    } catch (e) {
      v = importView({ ok: false, kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
    if (seq !== importSeq.current) return; // a newer import superseded this one
    setImporting(false);
    if (v.kind === "refused") setOutcome(v);
    else {
      setOutcome(null);
      setImportLog(v.warnings);
      if (v.warnings.length) {
        setPanelTab("importLog");
        setPanelOpen(true);
      }
      openFile(name, v.source!);
    }
    trackEvent("playground_import", { result: v.kind, source: src, ...(preset ? { preset } : {}) });
  }

  const activeSource = () => (active ? (editor.now()?.getValue(active.id) ?? active.text) : null);

  async function onExport(format: ExportFormat) {
    const text = activeSource();
    if (text == null) return;
    if (format === "bpmnscript") download(text, exportName(text, EXT), "text/plain");
    else {
      let xml = good?.source === text ? good.xml : null;
      if (xml == null) {
        // Edited since the last compile: export what this exact text compiles to.
        const r = await (await client.get()).compile(text).catch(() => null);
        if (!r?.ok) return;
        xml = r.output;
      }
      download(xml, exportName(xml, ".bpmn"), "application/xml");
    }
    trackEvent("playground_export", { format });
  }

  async function onShare() {
    const text = activeSource();
    if (text == null) return;
    const e = await encodeShare(text);
    if (!e.ok) return setShareState("too-long");
    history.replaceState(history.state, "", `#${e.hash}`);
    try {
      await navigator.clipboard.writeText(location.href);
      setShareUrl(null);
      setShareState("copied");
      clearTimeout(shareTimer.current);
      shareTimer.current = setTimeout(() => setShareState("idle"), SHARE_COPIED_MS);
    } catch {
      setShareUrl(location.href); // no clipboard: the field below selects itself
    }
    trackEvent("playground_share", {});
  }

  // ---- files ----

  function open(id: string) {
    update((w) => activate(w, id));
    setTab("source");
    if (isPhone()) setExplorerOpen(false);
    else editor.now()?.focus();
  }
  // Like an IDE: the name comes first, the file exists once the name is accepted.
  function newFile() {
    setExplorerOpen(true);
    setRenaming(NEW_FILE);
  }
  function rename(id: string, raw: string): RenameError | null {
    let r: Workspace | RenameError;
    if (id === NEW_FILE) {
      const name = cleanName(raw);
      r = !name ? "invalid" : wsRef.current.files.some((f) => f.name === name) ? "taken" : openText(wsRef.current, name, newFileText(name)).ws;
    } else r = renameFile(wsRef.current, id, raw);
    if (typeof r === "string") return r;
    update(() => r);
    setRenaming(null);
    if (id === NEW_FILE) {
      setTab("source");
      if (isPhone()) setExplorerOpen(false);
      setTimeout(() => editor.now()?.focus());
    }
    return null;
  }
  function remove(id: string) {
    const f = wsRef.current.files.find((x) => x.id === id);
    if (!f || !confirm(t("explorer.confirmDelete", { name: f.name }))) return;
    update((w) => deleteFile(w, id));
    setGoods(({ [id]: _, ...g }) => g);
  }
  const close = (id: string) => update((w) => closeTab(w, id));

  // Kept current every render, so the one window listener below always calls the latest handlers.
  const keys = useRef<Record<string, () => void>>({});
  keys.current = {
    save: () => ws.active && update((w) => saveFile(w, ws.active!)),
    newFile,
    close: () => ws.active && close(ws.active),
    next: () => update((w) => cycleTab(w, 1)),
    prev: () => update((w) => cycleTab(w, -1)),
    explorer: () => setExplorerOpen((o) => !(o ?? !isPhone())),
    panel: () => setPanelOpen((o) => !(o ?? !isPhone())),
    compile: () => void compileNow(),
    shortcuts: () => setShortcutsOpen(true),
  };
  useEffect(() => {
    // Capture phase, so these win over Monaco. Alt combinations match the physical key (macOS turns Alt+N into a dead key).
    const onKey = (e: KeyboardEvent) => {
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
      const alt = e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
      const k = e.key.toLowerCase();
      // "?" types into fields and the editor; it opens the shortcuts only from elsewhere.
      const typing = e.target instanceof Element && !!e.target.closest("input, textarea, select, [contenteditable], .monaco-editor, dialog");
      const action =
        isCompileShortcut(e) ? "compile"
        : e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing ? "shortcuts"
        : mod && k === "s" ? "save"
        : mod && k === "b" ? "explorer"
        : mod && k === "j" ? "panel"
        : alt && e.code === "KeyN" ? "newFile"
        : alt && e.code === "KeyW" ? "close"
        : alt && e.key === "PageDown" ? "next"
        : alt && e.key === "PageUp" ? "prev"
        : null;
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      keys.current[action]();
    };
    addEventListener("keydown", onKey, true);
    return () => removeEventListener("keydown", onKey, true);
  }, []);

  const isFileDrag = (e: DragEvent) => e.dataTransfer.types.includes("Files");
  const dropProps = {
    onDragOverCapture(e: DragEvent) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setDragging(true);
    },
    onDragLeave(e: DragEvent) {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDropCapture(e: DragEvent) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) void importFile(f, "drop");
    },
  };

  const count = (id: string, severity: 1 | 2) => (diags[id] ?? []).filter((d) => d.severity === severity).length;
  const errors = ws.files.reduce((n, f) => n + count(f.id, 1), 0);
  const warnings = ws.files.reduce((n, f) => n + count(f.id, 2), 0);
  const fileInfo = (id: string) => {
    const f = ws.files.find((x) => x.id === id)!;
    return { id, name: f.name, dirty: isDirty(f), errors: count(id, 1), warnings: count(id, 2) };
  };
  // The server frame is the default example: show it only while that is what the open file holds.
  const pristine = active?.text === initialSource;
  const outTab = tab === "xml" ? "xml" : "diagram";
  const explorerState = explorerOpen === null ? undefined : explorerOpen ? "open" : "closed";

  return (
    <Fallbacks.Provider value={{ editor: fallbackEditor, diagram: fallbackDiagram }}>
      <div
        className="pg-app"
        data-playground=""
        data-lsp={editorFailed ? "failed" : lsp}
        data-compile={compile.state}
        data-compile-seq={compile.seq}
        data-tab={tab}
        data-active-file={active?.name}
        data-explorer={explorerState}
        data-panel-default={panelOpen === null ? "" : undefined}
        {...dropProps}
      >
        <ClientHost onClient={onClient} />
        <PlaygroundHeader
          version={version}
          compileState={compileBtn.state}
          compileErrors={compileBtn.errors}
          canCompile={!!active}
          onCompile={() => void compileNow()}
          shareState={shareState}
          onShare={() => void onShare()}
          onShortcuts={() => setShortcutsOpen(true)}
          design={design}
        />
        <main id="main" className="pg-main">
          <div
            className="pg-side"
            onKeyDown={(e) => {
              // Phones: Escape closes the drawer and returns to its button.
              if (e.key !== "Escape" || e.defaultPrevented || !isPhone()) return;
              setExplorerOpen(false);
              document.querySelector<HTMLElement>("[data-pg-explorer-toggle]")?.focus();
            }}
          >
            <Explorer
              files={ws.files.map((f) => fileInfo(f.id))}
              active={ws.active}
              renaming={renaming}
              newName={uniqueName(ws, "untitled" + EXT)}
              onOpen={open}
              onNew={newFile}
              onStartRename={setRenaming}
              onRename={rename}
              onDelete={remove}
              onClose={() => setExplorerOpen(false)}
              presets={PRESETS}
              onPreset={(p) => void onPreset(p)}
              onImportFile={(f) => void importFile(f, "file")}
              exportState={{ bpmn: !!active && compile.state !== "error" && !empty }}
              onExport={(f) => void onExport(f)}
            />
          </div>
          {explorerOpen && <div className="pg-scrim" aria-hidden="true" onClick={() => setExplorerOpen(false)} />}
          <MobileTabs
            active={tab}
            onChange={setTab}
            panelIds={{ source: "pg-pane-source", diagram: "pg-pane-diagram", xml: "pg-pane-xml" }}
          />
          <div className="pg-src" id="pg-pane-source" role="tabpanel" aria-labelledby={tabId("phone", "source")}>
            <EditorTabs
              tabs={ws.open.map(fileInfo)}
              active={ws.active}
              explorerOpen={explorerOpen ?? false}
              onSelect={open}
              onClose={close}
              onToggleExplorer={keys.current.explorer}
            />
            <ImportBanner
              outcome={outcome}
              onDismiss={() => {
                setOutcome(null);
                editor.now()?.focus();
              }}
            />
            {notice && <p className="pg-notice">{notice}</p>}
            {empty && <p className="pg-notice">{t("empty")}</p>}
            {layoutWarning && (
              <p className="pg-notice" lang="en">
                {layoutWarning}
              </p>
            )}
            {shareUrl && (
              <input
                className="pg-share-url"
                readOnly
                value={shareUrl}
                aria-label={t("share.button")}
                ref={(el) => el?.select()}
                onBlur={() => setShareUrl(null)}
              />
            )}
            <div className="pg-editor-box">
              {loaded ? (
                <SourceEditor
                  key={editorKey}
                  onError={() => setEditorFailed(true)}
                  files={ws.files}
                  active={ws.active}
                  fallback={pristine ? fallbackEditor : null}
                  onChange={onChange}
                  onReady={editor.set}
                  onCursor={(line, col) => setCursor({ line, col })}
                  onDiagnostics={(id, d) => setDiags((m) => (!d.length && !m[id]?.length ? m : { ...m, [id]: d }))}
                />
              ) : (
                <EditorLoading />
              )}
              {loaded && !active && <NoFile />}
            </div>
          </div>
          <div className="pg-out">
            <MobileTabs
              variant="pane"
              active={outTab}
              onChange={setTab}
              panelIds={{ diagram: "pg-pane-diagram", xml: "pg-pane-xml" }}
            />
            <div
              className="pg-out-diagram"
              id="pg-pane-diagram"
              role="tabpanel"
              aria-labelledby={tabId("pane", "diagram")}
              data-stale={!active || compile.state === "error" || empty || !good ? "" : undefined}
              data-nofile={loaded && !active ? "" : undefined}
              aria-busy={importing || undefined}
            >
              <DiagramPane
                xml={good?.xml ?? null}
                fitKey={active?.id ?? ""}
                label={t("diagram.label")}
                fallback={pristine || !loaded ? fallbackDiagram : undefined}
              />
            </div>
            <XmlPane xml={good?.xml ?? ""} />
          </div>
          {(panelOpen ?? true) && (
            <div className="pg-bottom">
              <BottomPanel
                files={ws.files.map((f) => ({ id: f.id, name: f.name, problems: diags[f.id] ?? [] }))}
                importLog={importLog}
                onReveal={(id, line, col) => {
                  update((w) => activate(w, id));
                  setTab("source");
                  editor.now()?.revealPosition(id, line, col);
                }}
                onClose={() => setPanelOpen(false)}
                tab={panelTab}
                onTabChange={setPanelTab}
              />
            </div>
          )}
          {children}
        </main>
        <StatusBar
          lsp={editorFailed ? "failed" : lsp}
          compile={compile.state}
          firstErrorLine={compile.firstErrorLine}
          errors={errors}
          warnings={warnings}
          cursor={cursor}
          hasFile={!!active}
          onProblems={() => {
            setPanelTab("problems");
            setPanelOpen((o) => !(o ?? !isPhone()) || panelTab !== "problems");
          }}
          onRetry={() => {
            if (editorFailed) {
              setEditorFailed(false);
              setEditorKey((k) => k + 1);
            }
            if (lsp === "failed") client.now()?.restart();
          }}
        />
        <ShortcutsDialog
          open={shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
          keybindings={(id) => editor.now()?.keybindings(id) ?? []}
        />
        {dragging && (
          <div className="pg-drop" aria-hidden="true">
            {t("import.drop")}
          </div>
        )}
      </div>
    </Fallbacks.Provider>
  );
}

/** Shown over the editor while no file is open: what to do, and the keyboard shortcuts. */
function NoFile() {
  const t = useTranslations("playground");
  return (
    <div className="pg-nofile" data-pg-nofile="">
      <p className="pg-nofile-title">{t("noFile.title")}</p>
      <p>{t("noFile.hint")}</p>
      <PlaygroundShortcutList />
      <p>{t("noFile.shortcutsHint")}</p>
    </div>
  );
}
