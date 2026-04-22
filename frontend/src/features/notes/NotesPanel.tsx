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
import { TreeView, type TreeNode } from "./TreeView";

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

function buildTreeFromNotes(notes: ScannedNote[]): TreeNode[] {
  const root: TreeNode = { id: '', name: '', type: 'folder', children: [] };
  
  for (const note of notes) {
    const parts = note.id.split('/');
    let current = root;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const nodeId = parts.slice(0, i + 1).join('/');
      
      let child = current.children.find(c => c.name === part);
      if (!child) {
        child = {
          id: nodeId,
          name: part,
          type: isFile ? 'file' : 'folder',
          children: [],
          note: isFile ? note : undefined
        };
        current.children.push(child);
      }
      current = child;
    }
  }
  
  // Sort folders first, then files, alphabetically
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    }).map(node => ({
      ...node,
      children: sortNodes(node.children)
    }));
  };
  
  return sortNodes(root.children);
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

  const createVaultFolder = useCallback(async () => {
    if (!root) return;
    const folderPath = await promptApi.prompt("Create folder", {
      defaultValue: "notes/new-folder",
    });
    if (!folderPath) return;
    
    // Ensure the folder path ends with a slash for consistency
    const normalizedPath = folderPath.endsWith('/') ? folderPath : folderPath + '/';
    
    // Create an empty note with .md extension to represent the folder
    // In a real implementation, we would create an actual directory
    const note = await createNote(root, normalizedPath + ".folder.md", "# Folder\n\nThis is a folder placeholder.");
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
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const treeData = useMemo(() => buildTreeFromNotes(visibleNotes), [visibleNotes]);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleNoteClick = useCallback((noteId: string) => {
    void selectNote(noteId);
  }, [selectNote]);


  const handleEditBlur = useCallback(async () => {
    if (!editingNoteId || !root || editingName === editingNoteId) {
      setEditingNoteId(null);
      return;
    }

    try {
      await autosave.flush();
      const renamed = await renameNote(editingNoteId, editingName, root);
      removeNote(editingNoteId);
      removeSearchNote(editingNoteId);
      const stored = toScannedNote(renamed);
      upsertSearchNote(stored);
      upsertNote(stored);
      setSelectedId(renamed.id);
      setActiveNote(renamed);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to rename note"
      );
    } finally {
      setEditingNoteId(null);
    }
  }, [editingNoteId, editingName, root, autosave, removeNote, removeSearchNote, upsertSearchNote, upsertNote]);

  const handleEditKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleEditBlur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setEditingNoteId(null);
    }
  }, [handleEditBlur]);

  const handleStartEdit = useCallback((nodeId: string, currentPath: string) => {
    setEditingNoteId(nodeId);
    setEditingName(currentPath);
  }, []);

  return (
    <main className="grid min-h-0 flex-1 grid-cols-[19rem_minmax(0,1fr)] gap-0">
          
      <aside className="flex min-h-0 flex-col border-r border-black/10 bg-white/60">
        <div className="border-b border-black/10 px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Notes
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded border border-border p-1 hover:bg-muted disabled:opacity-60"
                onClick={createVaultFolder}
                disabled={!root}
                title="New folder"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
              <button
                type="button"
                className="rounded border border-border p-1 hover:bg-muted disabled:opacity-60"
                onClick={createVaultNote}
                disabled={!root}
                title="New note"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
            </div>
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
            <>
              <TreeView 
                nodes={treeData}
                selectedId={selectedId}
                expandedFolders={expandedFolders}
                onToggleFolder={toggleFolder}
                onSelectNote={handleNoteClick}
                onStartEdit={handleStartEdit}
                editingNoteId={editingNoteId}
                editingName={editingName}
                onEditChange={setEditingName}
                onEditBlur={handleEditBlur}
                onEditKeyDown={handleEditKeyDown}
              />
              {searchIds && visibleNotes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-black/15 bg-white/70 p-4 text-sm text-muted-foreground">
                  No notes match this search.
                </div>
              ) : null}
            </>
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
