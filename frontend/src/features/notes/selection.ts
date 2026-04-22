import type { ScannedNote } from "@/features/vault/types";

export function resolveSelectedNoteId(
  notes: ScannedNote[],
  requestedId: string | null,
): string | null {
  if (requestedId && notes.some((note) => note.id === requestedId)) {
    return requestedId;
  }

  return notes[0]?.id ?? null;
}
