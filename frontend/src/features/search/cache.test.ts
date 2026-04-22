import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScannedNote } from "@/features/vault/types";

const vaultReadFile = vi.fn();
const vaultWriteFile = vi.fn();

vi.mock("@/features/vault/api", () => ({
  vaultReadFile: (...args: unknown[]) => vaultReadFile(...args),
  vaultWriteFile: (...args: unknown[]) => vaultWriteFile(...args),
}));

import { createSearchIndex } from "./index";
import { loadSearchCache, saveSearchCache } from "./cache";
import { reconcileSearchIndex } from "./reconcile";

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

beforeEach(() => {
  vaultReadFile.mockReset();
  vaultWriteFile.mockReset();
});

describe("search cache", () => {
  it("loads, reconciles, and saves the FTS snapshot", async () => {
    const seed = createSearchIndex();
    seed.upsertNote(makeNote("notes/alpha.md", "Alpha", "old body", { mtime: 10 }));

    vaultReadFile.mockResolvedValueOnce(JSON.stringify(seed.toJSON()));

    const loaded = await loadSearchCache("/vault");
    expect(loaded).not.toBeNull();

    const index = createSearchIndex(loaded ?? undefined);
    const result = reconcileSearchIndex(index, [
      makeNote("notes/alpha.md", "Alpha", "new body", { mtime: 20 }),
      makeNote("notes/bravo.md", "Bravo", "fresh body", { mtime: 5 }),
    ]);

    expect(result.changed).toBe(true);
    expect(result.updated).toEqual(["notes/alpha.md"]);
    expect(result.added).toEqual(["notes/bravo.md"]);

    await saveSearchCache("/vault", index);

    expect(vaultReadFile).toHaveBeenCalledWith("/vault", ".app/fts.json");
    expect(vaultWriteFile).toHaveBeenCalledWith(
      "/vault",
      ".app/fts.json",
      expect.stringContaining('"notes/alpha.md"'),
    );
  });
});
