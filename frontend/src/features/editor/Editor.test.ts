import { describe, expect, it } from "vitest";

import { shouldSyncEditorDocument } from "./Editor";

describe("shouldSyncEditorDocument", () => {
  it("syncs when the same note reloads with new content", () => {
    expect(
      shouldSyncEditorDocument({
        currentNoteId: "notes/a.md",
        lastNoteId: "notes/a.md",
        currentDoc: "old body",
        nextValue: "new body",
      }),
    ).toBe(true);
  });

  it("does not sync when nothing changed", () => {
    expect(
      shouldSyncEditorDocument({
        currentNoteId: "notes/a.md",
        lastNoteId: "notes/a.md",
        currentDoc: "body",
        nextValue: "body",
      }),
    ).toBe(false);
  });

  it("syncs when the selected note changes", () => {
    expect(
      shouldSyncEditorDocument({
        currentNoteId: "notes/b.md",
        lastNoteId: "notes/a.md",
        currentDoc: "old body",
        nextValue: "new body",
      }),
    ).toBe(true);
  });
});
