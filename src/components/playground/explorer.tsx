"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { CloseIcon } from "@/components/shared/icons";
import type { RenameError } from "@/lib/playground/workspace";
import "./shell.css";

const glyph = (d: string, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={d} />
  </svg>
);
/** A page with a folded corner and a process arrow: a .bpmnscript file. */
export const FileIcon = () => (
  <svg className="pg-file-ic" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M4 1.75h5.25L12.5 5v9.25H4z" />
    <path d="M6.25 10.25h3.5M8.5 8.75l1.5 1.5-1.5 1.5" />
  </svg>
);
const NewFileIcon = () => glyph("M9 1.75H4v12.5h8.5V5.25L9 1.75zM8.25 7.5v4.5M6 9.75h4.5");
const RenameIcon = () => glyph("M10.5 2.5l3 3-8 8H2.5v-3z", 14);
const DeleteIcon = () => glyph("M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.75 9h5.5l.75-9", 14);

/** `renaming` value while a new file's name is entered; the file is created when the name is accepted. */
export const NEW_FILE = "new";

export type ExplorerFile = { id: string; name: string; dirty: boolean; errors: number; warnings: number };

/**
 * The file list. Click opens a file; double-click or F2 renames, Delete deletes (both on the
 * focused row). Naming (new file or rename) is an inline field: Enter or leaving the field
 * commits, Escape cancels.
 */
export function Explorer({
  files,
  active,
  renaming,
  newName,
  onOpen,
  onNew,
  onStartRename,
  onRename,
  onDelete,
  onClose,
}: {
  files: readonly ExplorerFile[];
  active: string | null;
  /** Id of the file whose name is being edited, or NEW_FILE. */
  renaming: string | null;
  /** Suggested name for a new file. */
  newName: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onStartRename: (id: string | null) => void;
  /** Returns why the name was refused, or null when it was applied. */
  onRename: (id: string, name: string) => RenameError | null;
  onDelete: (id: string) => void;
  /** The phone drawer's close button. */
  onClose: () => void;
}) {
  const t = useTranslations("playground.explorer");
  const [error, setError] = useState<RenameError | null>(null);
  // Set once Enter or Escape has decided; the blur that follows the field's removal must not commit again.
  const decided = useRef(false);

  const commit = (id: string, value: string, el: HTMLInputElement) => {
    const why = onRename(id, value);
    setError(why);
    decided.current = !why;
    if (why) el.focus();
  };

  const rowKeys = (e: KeyboardEvent, id: string) => {
    if (e.key === "F2") {
      e.preventDefault();
      onStartRename(id);
    } else if (e.key === "Delete") {
      e.preventDefault();
      onDelete(id);
    }
  };

  const nameField = (id: string, value: string) => (
    <span className="pg-xrow pg-xedit">
      <FileIcon />
      <input
        className="pg-xinput"
        defaultValue={value}
        aria-label={t("nameLabel")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `pg-xerr-${id}` : undefined}
        data-pg-rename=""
        spellCheck={false}
        autoFocus
        onFocus={(e) => {
          decided.current = false;
          const dot = e.target.value.lastIndexOf(".");
          e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(id, e.currentTarget.value, e.currentTarget);
          } else if (e.key === "Escape") {
            e.preventDefault();
            decided.current = true;
            setError(null);
            onStartRename(null);
          }
        }}
        onBlur={(e) => {
          if (decided.current) return;
          if (onRename(id, e.currentTarget.value)) onStartRename(null); // a refused name on blur is dropped
          setError(null);
        }}
      />
      {error && (
        <span className="pg-xerr" id={`pg-xerr-${id}`} role="alert">
          {t(error === "taken" ? "nameTaken" : "nameInvalid")}
        </span>
      )}
    </span>
  );

  return (
    <nav className="pg-explorer" aria-label={t("title")} data-pg-explorer="">
      <div className="pg-xhead">
        <h2>{t("title")}</h2>
        <button type="button" className="icon-btn" aria-label={t("newFile")} data-tip={t("newFile")} aria-keyshortcuts="Alt+N" data-pg-new-file="" onClick={onNew}>
          <NewFileIcon />
        </button>
        <button type="button" className="icon-btn pg-xclose" aria-label={t("close")} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <ul className="pg-xlist">
        {files.map((f) => (
          <li key={f.id} className="pg-xitem" data-pg-file={f.name} data-active={f.id === active ? "" : undefined}>
            {renaming === f.id ? (
              nameField(f.id, f.name)
            ) : (
              <>
                <button
                  type="button"
                  className="pg-xrow"
                  aria-current={f.id === active ? "true" : undefined}
                  aria-keyshortcuts="F2 Delete"
                  onClick={() => onOpen(f.id)}
                  onDoubleClick={() => onStartRename(f.id)}
                  onKeyDown={(e) => rowKeys(e, f.id)}
                >
                  <FileIcon />
                  <span className="pg-xname" data-errors={f.errors || undefined} data-warnings={f.warnings || undefined}>
                    {f.name}
                  </span>
                  {f.dirty && <span className="pg-dirty" data-pg-dirty="" />}
                  {f.errors + f.warnings > 0 && (
                    <span className="pg-xbadge" data-kind={f.errors ? "error" : "warning"}>
                      <span aria-hidden="true">{f.errors + f.warnings}</span>
                      <span className="pg-sr">, {t("problems", { n: f.errors + f.warnings })}</span>
                    </span>
                  )}
                </button>
                <span className="pg-xacts">
                  <button type="button" className="icon-btn" aria-label={t("rename", { name: f.name })} data-pg-rename-btn="" onClick={() => onStartRename(f.id)}>
                    <RenameIcon />
                  </button>
                  <button type="button" className="icon-btn" aria-label={t("delete", { name: f.name })} data-pg-delete-btn="" onClick={() => onDelete(f.id)}>
                    <DeleteIcon />
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
        {renaming === NEW_FILE && (
          <li className="pg-xitem" data-active="">
            {nameField(NEW_FILE, newName)}
          </li>
        )}
      </ul>
    </nav>
  );
}
