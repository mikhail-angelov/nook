// Single source of truth for the note list surfaced in the sidebar. Task 4
// will wire UI against this store; Task 3 only sets it up and feeds it from
// `ingestScan` / `applyEvent`.
//
// `root` persistence lives in App.tsx (rust-backed config.json) — the store
// just holds the in-memory mirror.

import { create } from "zustand";
import type { ScannedNote, VaultEvent } from "./types";

/** Note metadata held in the store. Matches `ScannedNote` 1:1 today. */
export type Note = ScannedNote;

export type VaultStore = {
  root: string | null;
  // Map keyed by note.id (which today is the vault-relative path).
  notes: Map<string, Note>;
  setRoot(root: string | null): void;
  ingestScan(scanned: ScannedNote[]): void;
  applyEvent(e: VaultEvent): void;
  removeNote(id: string): void;
  upsertNote(note: Note): void;
  _reset(): void;
};

export const useVaultStore = create<VaultStore>((set) => ({
  root: null,
  notes: new Map<string, Note>(),
  setRoot(root) {
    set({ root });
  },
  ingestScan(scanned) {
    set(() => {
      const map = new Map<string, Note>();
      for (const n of scanned) {
        map.set(n.id, n);
      }
      return { notes: map };
    });
  },
  applyEvent(e) {
    set((state) => {
      const next = new Map(state.notes);
      switch (e.kind) {
        case "Deleted": {
          // `id` == vault-relative path, and the event payload is the same.
          next.delete(e.data);
          break;
        }
        case "Created":
        case "Modified": {
          const existing = next.get(e.data);
          if (existing) {
            // We can't re-read the file here (that's an async backend call)
            // — just bump mtime so downstream consumers know it's stale.
            next.set(e.data, {
              ...existing,
              mtime: Math.floor(Date.now() / 1000),
            });
          } else {
            // Unknown file. Insert a stub so callers at least see something;
            // the owner is expected to call `vaultScan` to repopulate.
            next.set(e.data, synthesizeStub(e.data));
          }
          break;
        }
        case "Renamed": {
          const { from, to } = e.data;
          const existing = next.get(from);
          next.delete(from);
          if (existing) {
            next.set(to, { ...existing, id: to, path: to });
          } else {
            next.set(to, synthesizeStub(to));
          }
          break;
        }
      }
      return { notes: next };
    });
  },
  removeNote(id) {
    set((state) => {
      const next = new Map(state.notes);
      next.delete(id);
      return { notes: next };
    });
  },
  upsertNote(note) {
    set((state) => {
      const next = new Map(state.notes);
      next.set(note.id, note);
      return { notes: next };
    });
  },
  _reset() {
    set({ root: null, notes: new Map() });
  },
}));

function synthesizeStub(relPath: string): Note {
  const name = relPath.split("/").pop() ?? relPath;
  const isSecure = name.endsWith(".md.sec");
  const title = isSecure
    ? name.replace(/\.md\.sec$/, "")
    : name.replace(/\.(md|txt)$/, "");
  const now = Math.floor(Date.now() / 1000);
  return {
    id: relPath,
    path: relPath,
    title,
    body: isSecure ? null : "",
    is_secure: isSecure,
    mtime: now,
    created_at: now,
    tags: [],
    wikilinks: [],
  };
}
