import type { ScannedNote } from "@/features/vault/types";

export type ReconcileResult = {
  changed: boolean;
  added: string[];
  updated: string[];
  removed: string[];
};

export function reconcileSearchIndex(
  index: {
    listNotes(): Array<{ id: string; mtime: number }>;
    upsertNote(note: ScannedNote): void;
    removeNote(noteId: string): void;
  },
  scannedNotes: ScannedNote[],
): ReconcileResult {
  const previous = new Map(
    index.listNotes().map((note) => [note.id, note.mtime] as const),
  );
  const current = new Map(scannedNotes.map((note) => [note.id, note] as const));

  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];

  for (const note of scannedNotes) {
    const existingMtime = previous.get(note.id);
    if (existingMtime === undefined) {
      index.upsertNote(note);
      added.push(note.id);
      continue;
    }
    if (existingMtime < note.mtime) {
      index.upsertNote(note);
      updated.push(note.id);
    }
    previous.delete(note.id);
  }

  for (const noteId of previous.keys()) {
    if (!current.has(noteId)) {
      index.removeNote(noteId);
      removed.push(noteId);
    }
  }

  return {
    changed: added.length > 0 || updated.length > 0 || removed.length > 0,
    added,
    updated,
    removed,
  };
}
