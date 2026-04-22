// Holds the editor draft for the currently selected note and tracks whether
// the on-disk copy has diverged. Conflict detection: if we receive a
// `vault://event` Modified for the current note id while our buffer is dirty,
// set `conflict = true`. If clean, silently reload the buffer from disk.

import { useCallback, useEffect, useRef, useState } from "react";

import { onVaultEvent, vaultReadFile } from "@/features/vault/api";
import { loadNote, type Note } from "@/features/vault/notes";

export type NoteBuffer = {
  /** Editor draft. `null` while no note is selected. */
  draft: string;
  /** Set the current draft (called from the editor's onChange). */
  setDraft: (v: string) => void;
  /** Last body read from disk (updated by save + by silent reloads). */
  lastSavedBody: string;
  /** Set after a save; call this from the save() pipeline. */
  markSaved: (body: string) => void;
  /** `true` when an external change hit a dirty buffer. */
  conflict: boolean;
  /** Reload from disk, resolving a conflict. Caller decides when to invoke. */
  reloadFromDisk: () => Promise<void>;
};

export function useNoteBuffer(
  note: Note | null,
  vaultRoot: string | null,
): NoteBuffer {
  const [draft, setDraft] = useState<string>(note?.body ?? "");
  const [lastSavedBody, setLastSavedBody] = useState<string>(note?.body ?? "");
  const [conflict, setConflict] = useState(false);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const lastSavedRef = useRef(lastSavedBody);
  lastSavedRef.current = lastSavedBody;
  const noteIdRef = useRef<string | null>(note?.id ?? null);
  noteIdRef.current = note?.id ?? null;

  const markSaved = useCallback((body: string) => {
    setLastSavedBody(body);
    setConflict(false);
  }, []);

  // When the selected note changes, reseed both buffers.
  useEffect(() => {
    setDraft(note?.body ?? "");
    setLastSavedBody(note?.body ?? "");
    setConflict(false);
  }, [note?.id, note?.body]);

  const reloadFromDisk = useCallback(async (): Promise<void> => {
    if (!note || !vaultRoot) return;
    try {
      if (!note.isSecure) {
        const body = await vaultReadFile(vaultRoot, note.path);
        setDraft(body);
        setLastSavedBody(body);
      }
      const fresh = await loadNote(note.path, vaultRoot);
      if (fresh && fresh.body !== null) {
        setDraft(fresh.body);
        setLastSavedBody(fresh.body);
      }
      setConflict(false);
    } catch {
      // swallow: watcher may have fired for a deletion; nothing sensible to do.
    }
  }, [note, vaultRoot]);

  useEffect(() => {
    if (!note || !vaultRoot) return;
    let active = true;
    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        unlisten = await onVaultEvent((e) => {
          if (!active) return;
          const id = noteIdRef.current;
          if (!id) return;
          if (e.kind === "Modified" && e.data === id) {
            const dirty = draftRef.current !== lastSavedRef.current;
            if (dirty) {
              setConflict(true);
            } else {
              void reloadFromDisk();
            }
          }
        });
        if (!active) {
          unlisten();
          unlisten = null;
        }
      } catch {
        // onVaultEvent is unavailable 
      }
    })();

    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, [note, vaultRoot, reloadFromDisk]);

  return {
    draft,
    setDraft,
    lastSavedBody,
    markSaved,
    conflict,
    reloadFromDisk,
  };
}
