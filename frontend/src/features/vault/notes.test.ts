import { describe, expect, it, vi } from "vitest";

import {
  loadNote,
  makeNoteSecure,
  saveNote,
} from "./notes";
import type { ScannedNote } from "./types";

const vaultReadFile = vi.fn();
const vaultWriteFile = vi.fn();
const vaultDecryptNote = vi.fn();
const vaultEncryptNote = vi.fn();
const vaultDeleteFile = vi.fn();
const vaultRenameFile = vi.fn();

vi.mock("./api", () => ({
  vaultDeleteFile: (...args: unknown[]) => vaultDeleteFile(...args),
  vaultDecryptNote: (...args: unknown[]) => vaultDecryptNote(...args),
  vaultEncryptNote: (...args: unknown[]) => vaultEncryptNote(...args),
  vaultReadFile: (...args: unknown[]) => vaultReadFile(...args),
  vaultRenameFile: (...args: unknown[]) => vaultRenameFile(...args),
  vaultWriteFile: (...args: unknown[]) => vaultWriteFile(...args),
}));

describe("vault notes secure flows", () => {
  it("loads secure notes through the decrypt bridge", async () => {
    vaultDecryptNote.mockResolvedValueOnce("Secret body\n");

    const note = await loadNote("notes/secret.md.sec", "/vault");

    expect(vaultDecryptNote).toHaveBeenCalledWith("/vault", "notes/secret.md.sec");
    expect(note?.isSecure).toBe(true);
    expect(note?.body).toBe("Secret body\n");
  });

  it("saves secure notes through the encrypt bridge", async () => {
    vaultEncryptNote.mockResolvedValueOnce({
      id: "notes/secret.md.sec",
      path: "notes/secret.md.sec",
      title: "secret",
      body: null,
      is_secure: true,
      mtime: 123,
      created_at: 123,
      tags: [],
      wikilinks: [],
    });

    const note = await saveNote("notes/secret.md.sec", "/vault", "Secret body\n");

    expect(vaultEncryptNote).toHaveBeenCalledWith(
      "/vault",
      "notes/secret.md.sec",
      "Secret body\n",
    );
    expect(note.isSecure).toBe(true);
  });

  it("creates secure notes by appending the secure suffix", async () => {
    vaultEncryptNote.mockResolvedValueOnce({
      id: "notes/plain.md.sec",
      path: "notes/plain.md.sec",
      title: "plain",
      body: null,
      is_secure: true,
      mtime: 456,
      created_at: 456,
      tags: [],
      wikilinks: [],
    });

    const note = await makeNoteSecure("notes/plain.md", "/vault", "Plain body\n");

    expect(vaultEncryptNote).toHaveBeenCalledWith(
      "/vault",
      "notes/plain.md.sec",
      "Plain body\n",
    );
    expect(note.id).toBe("notes/plain.md.sec");
  });

  it("preserves scanned timestamps when loading a plaintext note", async () => {
    vaultReadFile.mockResolvedValueOnce("Alpha body\n");
    const scanned: ScannedNote = {
      id: "notes/a.md",
      path: "notes/a.md",
      title: "Alpha",
      body: "Alpha body\n",
      is_secure: false,
      mtime: 123,
      created_at: 45,
      tags: [],
      wikilinks: [],
    };

    const note = await loadNote("notes/a.md", "/vault", scanned);

    expect(note).toMatchObject({
      id: "notes/a.md",
      mtime: 123,
      createdAt: 45,
    });
  });
});
