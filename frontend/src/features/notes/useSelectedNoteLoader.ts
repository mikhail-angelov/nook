import { Dispatch, SetStateAction, useEffect, useState } from "react";

import type { Note } from "@/features/vault/notes";

type UseSelectedNoteLoaderArgs = {
  root: string | null;
  selectedId: string | null;
  loadSelectedNote: (noteId: string, vaultRoot: string | null) => Promise<Note | null>;
};

export function useSelectedNoteLoader({
  root,
  selectedId,
  loadSelectedNote,
}: UseSelectedNoteLoaderArgs): {
  loadedNote: Note | null;
  setLoadedNote: Dispatch<SetStateAction<Note | null>>;
} {
  const [loadedNote, setLoadedNote] = useState<Note | null>(null);

  useEffect(() => {
    if (!root || !selectedId) {
      setLoadedNote(null);
      return;
    }
    if (loadedNote?.id === selectedId) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const fresh = await loadSelectedNote(selectedId, root);
      if (!cancelled) {
        setLoadedNote(fresh);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadSelectedNote, loadedNote?.id, root, selectedId]);

  return { loadedNote, setLoadedNote };
}
