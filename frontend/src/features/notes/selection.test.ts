import { describe, expect, it } from "vitest";

import { resolveSelectedNoteId } from "./selection";

import type { ScannedNote } from "@/features/vault/types";

function makeScannedNote(id: string, title: string): ScannedNote {
  return {
    id,
    path: id,
    title,
    body: `${title}\n`,
    is_secure: false,
    mtime: 100,
    created_at: 100,
    tags: [],
    wikilinks: [],
  };
}

describe("resolveSelectedNoteId", () => {
  it("keeps the requested selection when that note still exists", () => {
    const notes = [
      makeScannedNote("notes/a.md", "Alpha"),
      makeScannedNote("notes/b.md", "Beta"),
    ];

    expect(resolveSelectedNoteId(notes, "notes/b.md")).toBe("notes/b.md");
  });

  it("falls back to the first note when the requested selection disappears", () => {
    const notes = [
      makeScannedNote("notes/a.md", "Alpha"),
      makeScannedNote("notes/b.md", "Beta"),
    ];

    expect(resolveSelectedNoteId(notes, "notes/missing.md")).toBe("notes/a.md");
  });

  it("returns null when the note list is empty", () => {
    expect(resolveSelectedNoteId([], "notes/a.md")).toBeNull();
  });
});
