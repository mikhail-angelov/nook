import { describe, expect, it } from "vitest";

import type { ScannedNote } from "@/features/vault/types";

import { resolveVisibleNotes } from "./visibleNotes";

function makeScannedNote(
  id: string,
  title: string,
  body = `${title} body\n`,
): ScannedNote {
  return {
    id,
    path: id,
    title,
    body,
    is_secure: false,
    mtime: 100,
    created_at: 100,
    tags: [],
    wikilinks: [],
  };
}

describe("resolveVisibleNotes", () => {
  it("returns all notes for a blank query", () => {
    const notes = [
      makeScannedNote("notes/a.md", "Alpha"),
      makeScannedNote("notes/b.md", "Beta"),
    ];

    expect(resolveVisibleNotes(notes, "")).toEqual(notes);
  });

  it("filters notes with the current note list instead of cached ids", () => {
    const notes = [
      makeScannedNote("notes/a.md", "Alpha"),
      makeScannedNote("notes/b.md", "Beta"),
    ];

    expect(resolveVisibleNotes(notes, "beta")).toEqual([notes[1]]);
  });
});
