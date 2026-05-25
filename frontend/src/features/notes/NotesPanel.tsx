import { useMemo, useRef, useState, useCallback, useEffect } from "react";

import {
  createNote,
  deleteNote,
  makeNoteSecure,
  loadNote,
  noteToScanned,
  scannedToNote,
  renameNote,
  saveNote,
  type Note,
} from "@/features/vault/notes";
import {
  removeSearchNote,
  upsertSearchNote,
} from "@/features/search/search";
import { vaultUnlockSecure } from "@/features/vault/api";
import { useAutosave } from "@/features/editor/useAutosave";
import { useNoteBuffer } from "@/features/editor/useNoteBuffer";
import { Editor } from "@/features/editor/Editor";
import { PromptApi } from "@/components/PromptDialog";
import { TabBar, type TabItem } from "@/components/TabBar";
import { ScannedNote, VaultEvent } from "../vault/types";
import { TreeView, type TreeNode } from "./TreeView";
import { resolveSelectedNoteId } from "./selection";
import { useSelectedNoteLoader } from "./useSelectedNoteLoader";
import { resolveVisibleNotes } from "./visibleNotes";

type NotesPanelProps = {
  root: string | null;
  status: string | null;
  promptApi: PromptApi;
  noteMap: Map<string, ScannedNote>;
  upsertNote: (note: ScannedNote) => void;
  removeNote: (id: string) => void;
  openVault: () => Promise<void>;
  vaultEvent: VaultEvent | null;
  initialNoteId?: string | null;
  /** Called when the selected note changes — for persistence. */
  onNoteSelected?: (noteId: string | null) => void;
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

// ── Tab manager for recently opened documents ───────────────────────────────

const MAX_TABS = 10;

function updateTabs(tabs: TabItem[], noteId: string, notes: ScannedNote[]): TabItem[] {
  // Already exists → move to end (most recent)
  const existing = tabs.find((t) => t.id === noteId);
  if (existing) {
    const rest = tabs.filter((t) => t.id !== noteId);
    return [...rest, existing];
  }
  // New tab
  const note = notes.find((n) => n.id === noteId);
  const title = note?.title ?? noteId.split("/").pop() ?? noteId;
  const newTab: TabItem = { id: noteId, title };
  const next = [...tabs, newTab];
  if (next.length > MAX_TABS) next.shift();
  return next;
}

export function NotesPanel({
  root,
  promptApi,
  noteMap,
  status: parentStatus,
  upsertNote,
  removeNote,
  openVault,
  vaultEvent,
  onNoteSelected,
}: NotesPanelProps) {
  const [requestedSelectedId, setRequestedSelectedId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [secureUnlocked, setSecureUnlocked] = useState(false);
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const lastSelectedRef = useRef<string | null>(null);

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
  const selectedId = useMemo(
    () => resolveSelectedNoteId(notes, requestedSelectedId),
    [notes, requestedSelectedId],
  );
  const visibleNotes = useMemo(
    () => resolveVisibleNotes(notes, searchQuery),
    [notes, searchQuery],
  );

  const selectedStoreNote = useMemo(
    () => notes.find((note) => note.id === selectedId) ?? null,
    [notes, selectedId],
  );
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
        const fresh = await loadNote(
          noteId,
          vaultRoot,
          noteMeta
            ? {
                mtime: noteMeta.mtime,
                createdAt: noteMeta.created_at,
              }
            : undefined,
        );
        return fresh;
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "Failed to load note",
        );
        return null;
      }
    },
    [notes, secureUnlocked, setStatus, unlockSecureVault],
  );
  const { loadedNote, setLoadedNote } = useSelectedNoteLoader({
    root,
    selectedId,
    loadSelectedNote,
  });

  const activeNote = useMemo(() => {
    if (loadedNote && loadedNote.id === selectedStoreNote?.id) {
      return loadedNote;
    }
    return selectedStoreNote ? scannedToNote(selectedStoreNote) : null;
  }, [loadedNote, selectedStoreNote]);
  const noteBuffer = useNoteBuffer(activeNote, root, vaultEvent);
  const title = activeNote?.title ?? selectedStoreNote?.title ?? null;
  const commitNote = useCallback(
    (
      note: Note,
      options?: {
        previousId?: string;
        select?: boolean;
      },
    ) => {
      if (options?.previousId && options.previousId !== note.id) {
        removeNote(options.previousId);
        removeSearchNote(options.previousId);
      }
      const stored = toScannedNote(note);
      upsertSearchNote(stored);
      upsertNote(stored);
      if (options?.select !== false) {
        setRequestedSelectedId(note.id);
      }
      setLoadedNote(note);
    },
    [removeNote, setLoadedNote, upsertNote],
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
        commitNote(saved, { select: selectedId === noteId });
        noteBuffer.markSaved(body);
      },
      [commitNote, noteBuffer, selectedId],
    ),
  });
  const refreshActiveNote = useCallback(
    async (noteId: string, vaultRoot: string | null) => {
      const fresh = await loadSelectedNote(noteId, vaultRoot);
      setLoadedNote(fresh);
      return fresh;
    },
    [loadSelectedNote, setLoadedNote],
  );

  const selectNote = useCallback(
    async (noteId: string) => {
      if (!root) return;
      setRequestedSelectedId(noteId);
      if (loadedNote?.id !== noteId) {
        setLoadedNote(null);
      }
      // Update tabs
      setTabs((prev) => updateTabs(prev, noteId, notes));
      // Notify parent for persistence
      onNoteSelected?.(noteId);
    },
    [root, loadedNote?.id, setLoadedNote, notes, onNoteSelected],
  );

  // Sync tab when selectedId changes externally (e.g. initial load)
  useEffect(() => {
    if (selectedId && selectedId !== lastSelectedRef.current) {
      lastSelectedRef.current = selectedId;
      setTabs((prev) => updateTabs(prev, selectedId, notes));
      onNoteSelected?.(selectedId);
    }
  }, [selectedId, notes, onNoteSelected]);

  const createVaultNote = useCallback(async () => {
    if (!root) return;
    const relPath = await promptApi.prompt("Create note", {
      defaultValue: "notes/new-note.md",
    });
    if (!relPath) return;
    await autosave.flush();
    const note = await createNote(root, relPath, "");
    commitNote(note);
  }, [autosave, commitNote, promptApi, root]);

  const performRename = useCallback(
    async (oldId: string, newPath: string) => {
      if (!root) return;
      await autosave.flush();
      const renamed = await renameNote(oldId, newPath, root);
      commitNote(renamed, { previousId: oldId });
      // Update tab title
      setTabs((prev) =>
        prev.map((t) =>
          t.id === oldId
            ? { ...t, id: renamed.id, title: renamed.title }
            : t,
        ),
      );
    },
    [autosave, commitNote, root],
  );

  const renameSelectedNote = useCallback(async () => {
    if (!root || !activeNote) return;
    const nextPath = await promptApi.prompt("Rename note", {
      defaultValue: activeNote.id,
    });
    if (!nextPath || nextPath === activeNote.id) return;
    await performRename(activeNote.id, nextPath);
  }, [activeNote, performRename, promptApi, root]);

  const makeSelectedNoteSecure = useCallback(async () => {
    if (!root || !activeNote) return;
    await autosave.flush();
    if (!secureUnlocked) {
      const unlocked = await unlockSecureVault(root);
      if (!unlocked) return;
    }
    try {
      const secured = await makeNoteSecure(root, activeNote.id);
      commitNote(secured, { previousId: activeNote.id });
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to secure note",
      );
    }
  }, [activeNote, autosave, commitNote, promptApi, root, secureUnlocked, unlockSecureVault]);

  const deleteSelectedNote = useCallback(async () => {
    if (!root || !activeNote) return;
    const confirm = await promptApi.prompt(
      `Delete "${activeNote.id}"? Type "yes" to confirm`,
      {
        defaultValue: "",
      },
    );
    if (confirm?.toLowerCase() !== "yes") return;
    await autosave.flush();
    await deleteNote(root, activeNote.id);
    setLoadedNote(null);
    setRequestedSelectedId(null);
    setTabs((prev) => prev.filter((t) => t.id !== activeNote.id));
    removeNote(activeNote.id);
    removeSearchNote(activeNote.id);
  }, [activeNote, autosave, deleteNote, promptApi, removeNote, root, setLoadedNote]);

  const handleNoteClick = useCallback((noteId: string) => {
    void selectNote(noteId);
  }, [selectNote]);

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    // If closing active tab, switch to the next one
    setTabs((prev) => {
      if (selectedId === tabId && prev.length > 0) {
        const last = prev[prev.length - 1];
        // Use setTimeout to avoid state update during render
        setTimeout(() => selectNote(last.id), 0);
      }
      return prev;
    });
  }, [selectedId, selectNote]);

  const hasNotes = notes.length > 0;
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  // ── Rename state and handlers ──

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);

  const handleEditBlur = useCallback(() => {
    if (!editingNoteId || !editingName) return;
    if (editingName !== editingNoteId) {
      void performRename(editingNoteId, editingName);
    }
    setEditingNoteId(null);
    setEditingName(null);
  }, [editingNoteId, editingName, performRename]);

  const handleEditKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleEditBlur();
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
    <main className="grid min-h-0 flex-1 grid-cols-[16rem_minmax(0,1fr)] gap-0">
      {/* ── Sidebar ── */}
      <aside className="flex min-h-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="border-b border-sidebar-border px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-sidebar-foreground/60">
              Files
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded p-1 text-sidebar-foreground/50 hover:bg-sidebar-border/50 hover:text-sidebar-foreground disabled:opacity-40"
                onClick={createVaultNote}
                disabled={!root}
                title="New note"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
            placeholder="Search…"
            className="mt-2 w-full rounded border border-sidebar-border bg-sidebar/50 px-2 py-1.5 text-xs outline-none ring-0 placeholder:text-sidebar-foreground/40"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1.5">
          {!hasNotes ? (
            <div className="rounded border border-dashed border-sidebar-border/50 p-3 text-xs text-sidebar-foreground/50">
              {root
                ? "No notes in this vault"
                : "Open a vault to get started"}
            </div>
          ) : (
            <>
              <TreeView
                nodes={visibleNotes.length > 0 ? buildTreeFromNotes(visibleNotes) : []}
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
              {searchQuery.trim() && visibleNotes.length === 0 ? (
                <div className="rounded border border-dashed border-sidebar-border/50 p-3 text-xs text-sidebar-foreground/50">
                  No notes match this search.
                </div>
              ) : null}
            </>
          )}
        </div>
      </aside>

      {/* ── Editor area ── */}
      <section className="flex min-h-0 flex-col bg-background">
        {/* Tab bar */}
        <TabBar
          tabs={tabs}
          activeId={activeNote?.id ?? null}
          onSelect={handleNoteClick}
          onClose={closeTab}
        />

        {/* Title bar */}
        {title ? (
          <div className="flex items-center justify-between border-b border-border px-4 py-1.5" data-testid="note-title-bar">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-foreground truncate max-w-md">
                {title}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                onClick={renameSelectedNote}
                disabled={!activeNote}
              >
                Rename
              </button>
              <button
                type="button"
                className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                onClick={deleteSelectedNote}
                disabled={!activeNote}
              >
                Delete
              </button>
              <button
                type="button"
                className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                onClick={makeSelectedNoteSecure}
                disabled={!activeNote || activeNote?.isSecure}
              >
                Secure
              </button>
            </div>
          </div>
        ) : null}

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
                void refreshActiveNote(activeNote.id, root);
              }}
              onGlobalSearch={focusGlobalSearch}
              vaultRoot={root}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-md rounded border border-border bg-card p-8 text-center">
                <h2 className="text-base font-semibold">
                  {root ? "Pick a note" : "Open a vault"}
                </h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  {root
                    ? "Select a note from the sidebar to start editing."
                    : "Choose a folder to scan markdown notes."}
                </p>
                {!root ? (
                  <button
                    type="button"
                    className="mt-4 rounded bg-foreground px-4 py-1.5 text-xs font-medium text-background hover:bg-foreground/90"
                    onClick={openVault}
                  >
                    Choose folder
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Status bar */}
        {(status || parentStatus) ? (
          <div className="border-t border-border bg-muted/50 px-4 py-1.5 text-xs text-destructive">
            {status || parentStatus}
          </div>
        ) : noteBuffer.conflict ? (
          <div className="border-t border-border bg-muted/50 px-4 py-1.5 text-xs text-amber-600">
            File changed on disk.{' '}
            <button
              type="button"
              className="underline hover:no-underline"
              onClick={() => activeNote && refreshActiveNote(activeNote.id, root)}
            >
              Reload
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
