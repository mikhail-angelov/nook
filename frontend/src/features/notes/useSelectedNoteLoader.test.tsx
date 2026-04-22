import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Note } from "@/features/vault/notes";

import { useSelectedNoteLoader } from "./useSelectedNoteLoader";

const loadSelectedNote = vi.fn();

function makeNote(id: string, title: string, body: string): Note {
  return {
    id,
    path: id,
    title,
    body,
    isSecure: false,
    mtime: 100,
    createdAt: 100,
  };
}

describe("useSelectedNoteLoader", () => {
  beforeEach(() => {
    loadSelectedNote.mockReset();
  });

  it("loads the selected note when the selection changes", async () => {
    loadSelectedNote.mockResolvedValue(makeNote("notes/a.md", "Alpha", "Alpha body\n"));

    const { result, rerender } = renderHook(
      ({ root, selectedId, activeNoteId }) =>
        useSelectedNoteLoader({
          root,
          selectedId,
          loadSelectedNote,
        }),
      {
        initialProps: {
          root: "/vault" as string | null,
          selectedId: null as string | null,
        },
      },
    );

    expect(result.current.loadedNote).toBeNull();

    rerender({
      root: "/vault",
      selectedId: "notes/a.md",
    });

    await waitFor(() => {
      expect(loadSelectedNote).toHaveBeenCalledWith("notes/a.md", "/vault");
      expect(result.current.loadedNote?.id).toBe("notes/a.md");
    });
  });

  it("clears the loaded note when there is no active selection", async () => {
    loadSelectedNote.mockResolvedValue(makeNote("notes/a.md", "Alpha", "Alpha body\n"));

    const { result, rerender } = renderHook(
      ({ root, selectedId, activeNoteId }) =>
        useSelectedNoteLoader({
          root,
          selectedId,
          loadSelectedNote,
        }),
      {
        initialProps: {
          root: "/vault" as string | null,
          selectedId: "notes/a.md" as string | null,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.loadedNote?.id).toBe("notes/a.md");
    });

    rerender({
      root: null,
      selectedId: null,
    });

    await waitFor(() => {
      expect(result.current.loadedNote).toBeNull();
    });
  });
});
