import { createSearchIndex } from "@/features/search/index";
import type { ScannedNote } from "@/features/vault/types";

export function resolveVisibleNotes(
  notes: ScannedNote[],
  query: string,
  limit = 50,
): ScannedNote[] {
  const normalized = query.trim();
  if (!normalized) {
    return notes;
  }

  const index = createSearchIndex();
  for (const note of notes) {
    index.upsertNote(note);
  }

  const ids = new Set(index.searchNotes(normalized, limit).map((note) => note.id));
  return notes.filter((note) => ids.has(note.id));
}
