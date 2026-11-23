"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CloseIcon } from "@/components/shared/icons";
import { COMPILE_SHORTCUT } from "@/generated/bpmnscript/editor/language";
import "./shell.css";

/** The playground's own keys, handled in playground-app.tsx. "Mod" is Ctrl, or Cmd on a Mac. */
export const PLAYGROUND_SHORTCUTS = [
  ["compile", COMPILE_SHORTCUT],
  ["save", "Mod+S"],
  ["newFile", "Alt+N"],
  ["closeTab", "Alt+W"],
  ["nextTab", "Alt+PageDown"],
  ["prevTab", "Alt+PageUp"],
  ["explorer", "Mod+B"],
  ["panel", "Mod+J"],
  ["rename", "F2"],
  ["delete", "Delete"],
  ["shortcuts", "?"],
] as const;

/** Monaco commands; their keys come from the editor's keybinding service, so they are the real ones. */
const EDITOR_COMMANDS = [
  ["palette", "workbench.action.showCommands"],
  ["suggest", "editor.action.triggerSuggest"],
  ["hover", "editor.action.showHover"],
  ["definition", "editor.action.revealDefinition"],
  ["peek", "editor.action.peekDefinition"],
  ["references", "editor.action.goToReferences"],
  ["renameSymbol", "editor.action.rename"],
  ["quickFix", "editor.action.quickFix"],
  ["format", "editor.action.formatDocument"],
  ["symbol", "workbench.action.gotoSymbol"],
  ["find", "actions.find"],
  ["replace", "editor.action.startFindReplaceAction"],
  ["comment", "editor.action.commentLine"],
  ["gotoLine", "workbench.action.gotoLine"],
] as const;

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** A key combination as <kbd>s: chords split on spaces, keys on "+" (a trailing "+" is the key itself). */
export function Keys({ combo }: { combo: string }) {
  const mac = isMac();
  return (
    <span className="pg-keys">
      {combo.split(" ").map((chord, c) => (
        <span key={c}>
          {c > 0 && " "}
          {chord.split(/\+(?!$)/).map((key, i) => (
            <span key={i}>
              {i > 0 && "+"}
              <kbd>{key === "Mod" ? (mac ? "Cmd" : "Ctrl") : key}</kbd>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

/** The playground's shortcuts as a definition list (also shown while no file is open). */
export function PlaygroundShortcutList() {
  const t = useTranslations("playground.shortcuts");
  return (
    <dl className="pg-keylist" aria-label={t("groupPlayground")}>
      {PLAYGROUND_SHORTCUTS.map(([k, combo]) => (
        <div key={k}>
          <dt>{t(k)}</dt>
          <dd>
            <Keys combo={combo} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Modal list of every keyboard shortcut. `keybindings` gives a Monaco command's key labels; commands
 * without any (no binding, or the editor has not started) are left out.
 */
export function ShortcutsDialog({
  open,
  onClose,
  keybindings,
}: {
  open: boolean;
  onClose: () => void;
  keybindings: (commandId: string) => string[];
}) {
  const t = useTranslations("playground.shortcuts");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d?.open) d?.showModal();
    else if (!open && d?.open) d.close();
  }, [open]);
  const editor = open
    ? EDITOR_COMMANDS.flatMap(([k, id]) => {
        const combos = keybindings(id);
        return combos.length ? [{ k, combos }] : [];
      })
    : [];

  return (
    <dialog
      ref={ref}
      className="pg-dialog"
      aria-labelledby="pg-shortcuts-title"
      data-pg-shortcuts=""
      onClose={onClose}
      // A click on the backdrop lands on the dialog element itself, outside its content.
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
    >
      <div className="pg-dialog-body">
        <div className="pg-dialog-head">
          <h2 id="pg-shortcuts-title">{t("title")}</h2>
          <button type="button" className="icon-btn" aria-label={t("close")} data-pg-shortcuts-close="" onClick={() => ref.current?.close()}>
            <CloseIcon />
          </button>
        </div>
        <div className="pg-dialog-cols">
          <section>
            <h3>{t("groupPlayground")}</h3>
            <PlaygroundShortcutList />
          </section>
          {editor.length > 0 && (
            <section>
              <h3>{t("groupEditor")}</h3>
              <dl className="pg-keylist" aria-label={t("groupEditor")}>
                {editor.map(({ k, combos }) => (
                  <div key={k} data-pg-shortcut={k}>
                    <dt>{t(k)}</dt>
                    <dd>
                      {combos.map((combo, i) => (
                        <span key={combo}>
                          {i > 0 && <span className="pg-keys-or"> {t("or")} </span>}
                          <Keys combo={combo} />
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
    </dialog>
  );
}
