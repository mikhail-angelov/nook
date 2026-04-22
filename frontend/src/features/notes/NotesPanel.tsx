import { useMemo, useRef, useState, useCallback, useEffect } from "react";

import {
  createNote,
  deleteNote,
  makeNoteSecure,
  loadNote,
  noteToScanned,
  renameNote,
  saveNote,
  type Note,
} from "@/features/vault/notes";
import {
  removeSearchNote,
  searchNotes,
  upsertSearchNote,
} from "@/features/search/search";
import { vaultUnlockSecure } from "@/features/vault/api";
import { useAutosave } from "@/features/editor/useAutosave";
import { useNoteBuffer } from "@/features/editor/useNoteBuffer";
import { Editor } from "@/features/editor/Editor";
import { PromptApi } from "@/components/PromptDialog";
import { ScannedNote } from "../vault/types";

type NotesPanelProps = {
  root: string | null;
  status: string | null;
  promptApi: PromptApi;
  noteMap: Map<string, ScannedNote>;
  upsertNote: (note: ScannedNote) => void;
  removeNote: (id: string) => void;
  openVault: () => Promise<void>;
};

function toScannedNote(note: Note): ScannedNote {
  return noteToScanned(note, note.body ?? "");
}

function sortNotes(a: ScannedNote, b: ScannedNote): number {
  const title = a.title.localeCompare(b.title, undefined, {
    sensitivity: "base",
  });
  return title !== 0 ? title : a.path.localeCompare(b.path);
}

export function NotesPanel({
  root,
  promptApi,
  noteMap,
  upsertNote,
  removeNote,
  openVault,
}: NotesPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIds, setSearchIds] = useState<string[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [secureUnlocked, setSecureUnlocked] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const noteBuffer = useNoteBuffer(activeNote, root);

  const focusGlobalSearch = useCallback((selection: string) => {
    const input = searchInputRef.current;
    if (!input) return;
    if (selection) {
      setSearchQuery(selection);
    }
    input.focus();
    requestAnimationFrame(() => {
      input.select();
    });
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        focusGlobalSearch("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [focusGlobalSearch]);

  const notes = useMemo(
    () => Array.from(noteMap.values()).sort(sortNotes),
    [noteMap],
  );

  const visibleNotes = useMemo(() => {
    if (!searchIds) {
      return notes;
    }
    const ids = new Set(searchIds);
    return notes.filter((note) => ids.has(note.id));
  }, [notes, searchIds]);

  const selectedStoreNote = useMemo(
    () => notes.find((note) => note.id === selectedId) ?? null,
    [notes, selectedId],
  );
  const title = activeNote?.title ?? selectedStoreNote?.title ?? null;
  const unlockSecureVault = useCallback(
    async (vaultRoot: string) => {
      const password = await promptApi.prompt("Vault password", {
        defaultValue: "",
      });
      if (!password) return false;
      await vaultUnlockSecure(vaultRoot, password);
      setSecureUnlocked(true);
      return true;
    },
    [promptApi],
  );
  const loadSelectedNote = useCallback(
    async (noteId: string, vaultRoot: string | null) => {
      if (!vaultRoot) return null;
      try {
        const noteMeta = notes.find((note) => note.id === noteId) ?? null;
        if (noteMeta?.is_secure && !secureUnlocked) {
          const unlocked = await unlockSecureVault(vaultRoot);
          if (!unlocked) return null;
        }
        const fresh = await loadNote(noteId, vaultRoot);
        if (fresh) {
          setActiveNote(fresh);
          upsertNote(toScannedNote(fresh));
        } else {
          setActiveNote(null);
        }
        return fresh;
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "Failed to load note",
        );
        setActiveNote(null);
        return null;
      }
    },
    [notes, secureUnlocked, setStatus, unlockSecureVault, upsertNote],
  );
  const autosave = useAutosave({
    note: activeNote,
    draftBody: noteBuffer.draft,
    vaultRoot: root,
    save: useCallback(
      async (noteId: string, body: string, vaultRoot: string | null) => {
        if (!vaultRoot) return;
        const saved = await saveNote(noteId, vaultRoot, body);
        if (!saved) return;
        const stored = toScannedNote(saved);
        upsertSearchNote(stored);
        upsertNote(stored);
        setActiveNote(saved);
        noteBuffer.markSaved(body);
      },
      [noteBuffer, upsertNote],
    ),
  });
  const refreshActiveNote = useCallback(
    async (noteId: string, vaultRoot: string | null) => {
      return loadSelectedNote(noteId, vaultRoot);
    },
    [loadSelectedNote],
  );

  const selectNote = useCallback(
    async (noteId: string) => {
      if (!root) return;
      setSelectedId(noteId);
    },
    [root],
  );

  useEffect(() => {
    let cancelled = false;
    if (!searchQuery.trim()) {
      setSearchIds(null);
      return;
    }
    void (async () => {
      const results = await searchNotes(searchQuery, 50);
      if (!cancelled) {
        setSearchIds(results.map((result) => result.id));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notes, searchQuery]);

  useEffect(() => {
    if (!root) return;
    if (selectedId && notes.some((note) => note.id === selectedId)) return;
    const first = notes[0];
    if (first) {
      setSelectedId(first.id);
    }
  }, [notes, root, selectedId]);


    useEffect(() => {
      if (!root || !selectedId) {
        setActiveNote(null);
        return;
      }
      if (activeNote?.id === selectedId) {
        return;
      }
      let cancelled = false;
      void (async () => {
        const fresh = await loadSelectedNote(selectedId, root);
        if (cancelled) return;
        if (!fresh) {
          setActiveNote(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [activeNote?.id, loadSelectedNote, root, selectedId]);

  const createVaultNote = useCallback(async () => {
    if (!root) return;
    const relPath = await promptApi.prompt("Create note", {
      defaultValue: "notes/new-note.md",
    });
    if (!relPath) return;
    await autosave.flush();
    const note = await createNote(root, relPath, "");
    const stored = toScannedNote(note);
    upsertSearchNote(stored);
    upsertNote(stored);
    setSelectedId(note.id);
    setActiveNote(note);
  }, [autosave, promptApi, root, upsertNote]);

  const renameSelectedNote = useCallback(async () => {
    if (!root || !activeNote) return;
    const nextPath = await promptApi.prompt("Rename note", {
      defaultValue: activeNote.id,
    });
    if (!nextPath || nextPath === activeNote.id) return;
    await autosave.flush();
    const renamed = await renameNote(activeNote.id, nextPath, root);
    removeNote(activeNote.id);
    removeSearchNote(activeNote.id);
    const stored = toScannedNote(renamed);
    upsertSearchNote(stored);
    upsertNote(stored);
    setSelectedId(renamed.id);
    setActiveNote(renamed);
  }, [activeNote, autosave, promptApi, removeNote, root, upsertNote]);

  const makeSelectedNoteSecure = useCallback(async () => {
    if (!root || !activeNote) return;
    await autosave.flush();
    if (!secureUnlocked) {
      const unlocked = await unlockSecureVault(root);
      if (!unlocked) return;
    }
    const secured = await makeNoteSecure(
      activeNote.id,
      root,
      noteBuffer.draft ?? activeNote.body ?? "",
    );
    removeNote(activeNote.id);
    removeSearchNote(activeNote.id);
    const stored = toScannedNote(secured);
    upsertSearchNote(stored);
    upsertNote(stored);
    setSelectedId(secured.id);
    setActiveNote(secured);
  }, [
    activeNote,
    autosave,
    noteBuffer.draft,
    removeNote,
    root,
    secureUnlocked,
    unlockSecureVault,
    upsertNote,
  ]);

  const deleteSelectedNote = useCallback(async () => {
    if (!root || !activeNote) return;
    const confirmed = await promptApi.confirm(`Delete "${activeNote.title}"?`);
    if (!confirmed) return;
    await autosave.flush();
    await deleteNote(activeNote.id, root);
    removeNote(activeNote.id);
    removeSearchNote(activeNote.id);
    const next = notes.find((note) => note.id !== activeNote.id) ?? null;
    setSelectedId(next?.id ?? null);
    setActiveNote(null);
  }, [activeNote, autosave, notes, promptApi, removeNote, root]);

  const reloadSelectedNote = useCallback(async () => {
    if (!root || !activeNote) return;
    await noteBuffer.reloadFromDisk();
    await refreshActiveNote(activeNote.id, root);
  }, [activeNote, noteBuffer, refreshActiveNote, root]);

  const hasNotes = notes.length > 0;

  return (
    <main className="grid min-h-0 flex-1 grid-cols-[19rem_minmax(0,1fr)] gap-0">
          
      <aside className="flex min-h-0 flex-col border-r border-black/10 bg-white/60">
        <div className="border-b border-black/10 px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Notes
            </div>
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
              onClick={createVaultNote}
              disabled={!root}
            >
              New note
            </button>
          </div>
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
            placeholder="Search notes (⌘⇧F)"
            className="mt-3 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {!hasNotes ? (
            <div className="rounded-lg border border-dashed border-black/15 bg-white/70 p-4 text-sm text-muted-foreground">
              {root
                ? "No notes in this vault."
                : "Open a vault to see your notes."}
            </div>
          ) : (
            <div className="space-y-1">
              {visibleNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  aria-label={note.title}
                  onClick={() => {
                    void selectNote(note.id);
                  }}
                  className={`flex w-full flex-col items-start rounded-lg border px-3 py-2 text-left text-sm transition ${
                    note.id === selectedId
                      ? "border-black/20 bg-black text-white shadow-sm"
                      : "border-transparent bg-white/80 hover:border-black/10 hover:bg-white"
                  }`}
                >
                  <span className="font-medium">{note.title}</span>
                  <span
                    className={`text-xs ${note.id === selectedId ? "text-white/70" : "text-muted-foreground"}`}
                  >
                    {note.path}
                  </span>
                </button>
              ))}
              {searchIds && visibleNotes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-black/15 bg-white/70 p-4 text-sm text-muted-foreground">
                  No notes match this search.
                </div>
              ) : null}
            </div>
          )}
        </div>
      </aside>
      <section className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-black/10 bg-white/50 px-5 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Editor
            </div>
            <div className="text-sm font-medium">{title}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-60"
              onClick={renameSelectedNote}
              disabled={!activeNote}
            >
              Rename note
            </button>
            <button
              type="button"
              className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-60"
              onClick={deleteSelectedNote}
              disabled={!activeNote}
            >
              Delete note
            </button>
            <button
              type="button"
              className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-60"
              onClick={makeSelectedNoteSecure}
              disabled={!activeNote || activeNote?.isSecure}
            >
              Make secure
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {root && activeNote ? (
            <Editor
              note={activeNote}
              value={noteBuffer.draft}
              onChange={noteBuffer.setDraft}
              onBlur={() => {
                void autosave.flush();
              }}
              conflict={noteBuffer.conflict}
              onReload={() => {
                void reloadSelectedNote();
              }}
              onGlobalSearch={focusGlobalSearch}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-md rounded-2xl border border-black/10 bg-white/80 p-8 text-center shadow-sm">
                <h2 className="text-lg font-semibold">
                  {root ? "Pick a note" : "Open a vault"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {root
                    ? "Select a note from the sidebar to start editing it."
                    : "Choose a folder to scan markdown notes and start the watcher."}
                </p>
                {!root ? (
                  <button
                    type="button"
                    className="mt-5 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
                    onClick={openVault}
                  >
                    Choose folder
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </section>
      {status ? (
        <div className="border-t border-black/10 bg-amber-50 px-6 py-3 text-sm text-amber-900">
          {status}
        </div>
      ) : noteBuffer.conflict ? (
        <div className="border-t border-black/10 bg-amber-50 px-6 py-3 text-sm text-amber-900">
          File changed on disk. Reload or keep editing to preserve your draft.
        </div>
      ) : null}
    </main>
  );
}
