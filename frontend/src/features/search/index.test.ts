import { describe, expect, it } from "vitest";

import type { ScannedNote } from "@/features/vault/types";

import { createSearchIndex } from "./index";

function makeNote(
  id: string,
  title: string,
  body: string,
  overrides: Partial<ScannedNote> = {},
): ScannedNote {
  return {
    id,
    path: overrides.path ?? id,
    title,
    body,
    is_secure: overrides.is_secure ?? false,
    mtime: overrides.mtime ?? 100,
    created_at: overrides.created_at ?? 100,
    tags: overrides.tags ?? [],
    wikilinks: overrides.wikilinks ?? [],
  };
}

describe("createSearchIndex", () => {
  it("indexes note title, body, and tags while skipping secure notes", () => {
    const index = createSearchIndex();
    index.upsertNote(makeNote("notes/alpha.md", "Alpha", "Roadmap review", { tags: ["work"] }));
    index.upsertNote(
      makeNote("notes/secret.md.sec", "Secret", "do not index", {
        is_secure: true,
      }),
    );

    expect(index.search("alpha roadmap work").map((hit) => hit.id)).toEqual([
      "notes/alpha.md",
    ]);
    expect(index.search("secret").map((hit) => hit.id)).toEqual([]);
  });

  it("applies tag, path, and phrase filters", () => {
    const index = createSearchIndex();
    index.upsertNote(
      makeNote("notes/team/alpha.md", "Alpha", "Meeting notes for roadmap", {
        path: "notes/team/alpha.md",
        tags: ["work", "meeting"],
      }),
    );
    index.upsertNote(
      makeNote("notes/personal/bravo.md", "Bravo", "Meeting notes for roadmap", {
        path: "notes/personal/bravo.md",
        tags: ["personal"],
      }),
    );

    expect(
      index.search('tag:work path:notes/team/ "roadmap" meeting').map((hit) => hit.id),
    ).toEqual(["notes/team/alpha.md"]);
  });
});
