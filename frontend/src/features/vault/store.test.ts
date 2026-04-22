import { beforeEach, describe, expect, it } from "vitest";

import { useVaultStore } from "./store";
import type { ScannedNote, VaultEvent } from "./types";

describe("useVaultStore", () => {
  beforeEach(() => {
    useVaultStore.getState()._reset();
  });

  const note = (id: string, overrides: Partial<ScannedNote> = {}): ScannedNote => ({
    id,
    path: id,
    title: overrides.title ?? id,
    body: overrides.body ?? "",
    is_secure: overrides.is_secure ?? false,
    mtime: overrides.mtime ?? 100,
    created_at: overrides.created_at ?? 100,
    tags: overrides.tags ?? [],
    wikilinks: overrides.wikilinks ?? [],
  });

  it("ingestScan populates the map keyed by id", () => {
    useVaultStore.getState().ingestScan([note("notes/a.md"), note("notes/b.md")]);
    const { notes } = useVaultStore.getState();
    expect(notes.size).toBe(2);
    expect(notes.get("notes/a.md")?.title).toBe("notes/a.md");
  });

  it("applyEvent Modified bumps mtime on an existing entry", () => {
    useVaultStore.getState().ingestScan([note("notes/a.md", { mtime: 100 })]);
    const event: VaultEvent = { kind: "Modified", data: "notes/a.md" };
    useVaultStore.getState().applyEvent(event);
    const after = useVaultStore.getState().notes.get("notes/a.md");
    expect(after).toBeDefined();
    expect(after!.mtime).toBeGreaterThan(100);
  });

  it("applyEvent Deleted removes the entry", () => {
    useVaultStore.getState().ingestScan([note("notes/a.md")]);
    useVaultStore
      .getState()
      .applyEvent({ kind: "Deleted", data: "notes/a.md" });
    expect(useVaultStore.getState().notes.has("notes/a.md")).toBe(false);
  });

  it("applyEvent Renamed moves the entry under the new id", () => {
    useVaultStore.getState().ingestScan([note("notes/old.md", { title: "Old" })]);
    useVaultStore.getState().applyEvent({
      kind: "Renamed",
      data: { from: "notes/old.md", to: "notes/new.md" },
    });
    const { notes } = useVaultStore.getState();
    expect(notes.has("notes/old.md")).toBe(false);
    const moved = notes.get("notes/new.md");
    expect(moved?.id).toBe("notes/new.md");
    expect(moved?.path).toBe("notes/new.md");
    expect(moved?.title).toBe("Old");
  });

  it("applyEvent Created for an unknown path synthesizes a stub", () => {
    useVaultStore
      .getState()
      .applyEvent({ kind: "Created", data: "notes/fresh.md" });
    const stub = useVaultStore.getState().notes.get("notes/fresh.md");
    expect(stub).toBeDefined();
    expect(stub!.is_secure).toBe(false);
    expect(stub!.title).toBe("fresh");

    useVaultStore
      .getState()
      .applyEvent({ kind: "Created", data: "notes/secret.md.sec" });
    const secure = useVaultStore.getState().notes.get("notes/secret.md.sec");
    expect(secure?.is_secure).toBe(true);
    expect(secure?.body).toBeNull();
    expect(secure?.title).toBe("secret");
  });
});
