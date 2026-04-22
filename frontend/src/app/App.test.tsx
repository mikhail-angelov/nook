import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Note } from "@/features/vault/notes";
import type { ScannedNote, VaultEvent } from "@/features/vault/types";
import { useVaultStore } from "@/features/vault/store";

const vaultPickFolder = vi.fn();
const vaultScan = vi.fn();
const vaultStartWatching = vi.fn();
const vaultStopWatching = vi.fn();
const onVaultEvent = vi.fn();
const vaultReadFile = vi.fn();
const vaultDecryptNote = vi.fn();
const vaultEncryptNote = vi.fn();
const vaultUnlockSecure = vi.fn();
const loadNote = vi.fn();
const saveNote = vi.fn();
const createNote = vi.fn();
const renameNote = vi.fn();
const deleteNote = vi.fn();
const makeNoteSecure = vi.fn();
const restoreSearchIndex = vi.fn();
const searchNotes = vi.fn();
const upsertSearchNote = vi.fn();
const removeSearchNote = vi.fn();
const vaultEventHandlers: Array<(event: VaultEvent) => void> = [];

vi.mock("@/features/vault/api", () => ({
  vaultPickFolder: (...args: unknown[]) => vaultPickFolder(...args),
  vaultScan: (...args: unknown[]) => vaultScan(...args),
  vaultStartWatching: (...args: unknown[]) => vaultStartWatching(...args),
  vaultStopWatching: (...args: unknown[]) => vaultStopWatching(...args),
  onVaultEvent: (...args: unknown[]) => onVaultEvent(...args),
  vaultReadFile: (...args: unknown[]) => vaultReadFile(...args),
  vaultDecryptNote: (...args: unknown[]) => vaultDecryptNote(...args),
  vaultEncryptNote: (...args: unknown[]) => vaultEncryptNote(...args),
  vaultUnlockSecure: (...args: unknown[]) => vaultUnlockSecure(...args),
  vaultWriteFile: vi.fn(),
}));

vi.mock("@/features/vault/notes", () => ({
  loadNote: (...args: unknown[]) => loadNote(...args),
  saveNote: (...args: unknown[]) => saveNote(...args),
  createNote: (...args: unknown[]) => createNote(...args),
  renameNote: (...args: unknown[]) => renameNote(...args),
  deleteNote: (...args: unknown[]) => deleteNote(...args),
  makeNoteSecure: (...args: unknown[]) => makeNoteSecure(...args),
  noteToScanned: (note: Note, body: string) => ({
    id: note.id,
    path: note.path,
    title: note.title,
    body,
    is_secure: note.isSecure,
    mtime: note.mtime,
    created_at: note.createdAt,
    tags: [],
    wikilinks: [],
  }),
  scannedToNote: (note: Note) => note,
}));

vi.mock("@/features/search/search", () => ({
  restoreSearchIndex: (...args: unknown[]) => restoreSearchIndex(...args),
  searchNotes: (...args: unknown[]) => searchNotes(...args),
  upsertSearchNote: (...args: unknown[]) => upsertSearchNote(...args),
  removeSearchNote: (...args: unknown[]) => removeSearchNote(...args),
}));

vi.mock("@/features/editor/Editor", () => ({
  Editor: ({
    note,
    value,
    onChange,
    onBlur,
    conflict,
    onReload,
  }: {
    note: Note | null;
    value: string;
    onChange: (body: string) => void;
    onBlur?: () => void;
    conflict?: boolean;
    onReload?: () => void;
  }) => (
    <div>
      <div data-testid="editor-note">{note?.id ?? "none"}</div>
      <div data-testid="editor-value">{value}</div>
      <div data-testid="editor-conflict">{conflict ? "yes" : "no"}</div>
      <button type="button" onClick={() => onChange("edited body")}>
        Edit body
      </button>
      <button type="button" onClick={() => onBlur?.()}>
        Blur
      </button>
      <button type="button" onClick={() => onReload?.()}>
        Reload
      </button>
    </div>
  ),
}));

vi.mock("@/features/ai/ChatPanel", () => ({
  ChatPanel: () => <div data-testid="chat-panel" />,
}));

vi.mock("@/components/PromptDialog", () => ({
  usePromptDialog: () => [
    {
      prompt: promptMock,
      confirm: confirmMock,
    },
    null,
  ],
}));

import App from "./App";

const promptMock = vi.fn();
const confirmMock = vi.fn();

function makeScannedNote(
  id: string,
  title: string,
  overrides: Partial<ScannedNote> = {},
): ScannedNote {
  return {
    id,
    path: overrides.path ?? id,
    title,
    body: overrides.body ?? `${title}\n`,
    is_secure: overrides.is_secure ?? false,
    mtime: overrides.mtime ?? 100,
    created_at: overrides.created_at ?? 100,
    tags: overrides.tags ?? [],
    wikilinks: overrides.wikilinks ?? [],
  };
}

function makeNote(
  id: string,
  title: string,
  body: string,
  overrides: Partial<Note> = {},
): Note {
  return {
    id,
    path: overrides.path ?? id,
    title,
    body,
    isSecure: overrides.isSecure ?? false,
    mtime: overrides.mtime ?? 100,
    createdAt: overrides.createdAt ?? 100,
  };
}

function emitVaultEvent(event: VaultEvent): void {
  for (const handler of [...vaultEventHandlers]) {
    handler(event);
  }
}

describe("App vault shell", () => {
  beforeEach(() => {
    useVaultStore.getState()._reset();
    promptMock.mockReset();
    confirmMock.mockReset();
    vaultPickFolder.mockReset().mockResolvedValue("/vault");
    vaultScan.mockReset().mockResolvedValue([
      makeScannedNote("notes/a.md", "Alpha"),
      makeScannedNote("notes/b.md", "Beta"),
    ]);
    vaultStartWatching.mockReset().mockResolvedValue(undefined);
    vaultStopWatching.mockReset().mockResolvedValue(undefined);
    onVaultEvent.mockReset().mockImplementation(async (handler) => {
      vaultEventHandlers.push(handler as (event: VaultEvent) => void);
      return () => {
        const index = vaultEventHandlers.indexOf(handler as (event: VaultEvent) => void);
        if (index >= 0) {
          vaultEventHandlers.splice(index, 1);
        }
      };
    });
    loadNote.mockReset().mockImplementation(async (id: string) => {
      if (id === "notes/a.md") {
        return makeNote(id, "Alpha", "Alpha body\n");
      }
      if (id === "notes/b.md") {
        return makeNote(id, "Beta", "Beta body\n");
      }
      return null;
    });
    saveNote.mockReset().mockImplementation(async (id: string, _root: string, body: string) =>
      makeNote(id, "Alpha saved", body, { mtime: 201, createdAt: 201 }),
    );
    createNote.mockReset().mockImplementation(async (_root: string, relPath: string, body: string) =>
      makeNote(relPath, "Gamma", body, { mtime: 301, createdAt: 301 }),
    );
    renameNote.mockReset().mockImplementation(async (_id: string, newRelPath: string) =>
      makeNote(newRelPath, "Alpha renamed", "Alpha renamed body\n", {
        path: newRelPath,
        mtime: 401,
        createdAt: 401,
      }),
    );
    deleteNote.mockReset().mockResolvedValue(undefined);
    makeNoteSecure.mockReset().mockImplementation(async (id: string, _root: string, body: string) =>
      makeNote(`${id}.sec`, "Alpha secured", body, {
        path: `${id}.sec`,
        isSecure: true,
        mtime: 501,
        createdAt: 501,
      }),
    );
    restoreSearchIndex.mockReset().mockResolvedValue(undefined);
    searchNotes.mockReset().mockResolvedValue([]);
    upsertSearchNote.mockReset();
    removeSearchNote.mockReset();
    vaultReadFile.mockReset().mockResolvedValue("Alpha from disk\n");
    vaultDecryptNote.mockReset().mockResolvedValue("Secret body\n");
    vaultEncryptNote.mockReset().mockImplementation(async (_root: string, relPath: string, body: string) =>
      ({
        id: relPath,
        path: relPath,
        title: relPath.replace(/\.md\.sec$/, "").replace(/\.md$/, ""),
        body,
        isSecure: true,
        mtime: 601,
        createdAt: 601,
      } satisfies Note),
    );
    vaultUnlockSecure.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a vault, loads notes, selects the first note, and starts watching", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open vault" }));

    await waitFor(() => {
      expect(vaultPickFolder).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(vaultScan).toHaveBeenCalledWith("/vault");
    });
    await waitFor(() => {
      expect(vaultStartWatching).toHaveBeenCalledWith("/vault");
    });

    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beta" })).toBeInTheDocument();
    expect(screen.getByTestId("editor-note")).toHaveTextContent("notes/a.md");
    expect(screen.getByTestId("editor-value")).toHaveTextContent("Alpha body");
  });

  it("loads a clicked note into the editor", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open vault" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Beta" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Beta" }));

    await waitFor(() => {
      expect(loadNote).toHaveBeenCalledWith("notes/b.md", "/vault");
    });
    expect(screen.getByTestId("editor-note")).toHaveTextContent("notes/b.md");
    expect(screen.getByTestId("editor-value")).toHaveTextContent("Beta body");
  });

  it("flushes autosave on blur and updates the sidebar title from the saved note", async () => {
    saveNote.mockResolvedValueOnce(
      makeNote("notes/a.md", "Alpha saved", "edited body", {
        mtime: 222,
        createdAt: 222,
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open vault" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit body" }));
    fireEvent.click(screen.getByRole("button", { name: "Blur" }));

    await waitFor(() => {
      expect(saveNote).toHaveBeenCalledWith(
        "notes/a.md",
        "/vault",
        "edited body",
      );
    });
    expect(screen.getByTestId("editor-value")).toHaveTextContent("edited body");
    expect(screen.getByRole("button", { name: /Alpha saved/ })).toBeInTheDocument();
  });

  it("creates a new note through the prompt and bridge", async () => {
    promptMock.mockResolvedValueOnce("notes/gamma.md");

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open vault" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "New note" }));

    await waitFor(() => {
      expect(createNote).toHaveBeenCalledWith("/vault", "notes/gamma.md", "");
    });
    expect(screen.getByTestId("editor-note")).toHaveTextContent("notes/gamma.md");
    expect(screen.getByRole("button", { name: /Gamma/ })).toBeInTheDocument();
  });

  it("renames the selected note through the prompt and bridge", async () => {
    promptMock.mockResolvedValueOnce("notes/alpha-renamed.md");

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open vault" }));

    await waitFor(() => {
      expect(screen.getByTestId("editor-note")).toHaveTextContent("notes/a.md");
    });

    fireEvent.click(screen.getByRole("button", { name: "Rename note" }));

    await waitFor(() => {
      expect(renameNote).toHaveBeenCalledWith(
        "notes/a.md",
        "notes/alpha-renamed.md",
        "/vault",
      );
    });
    expect(screen.getByTestId("editor-note")).toHaveTextContent(
      "notes/alpha-renamed.md",
    );
    expect(screen.getByRole("button", { name: /Alpha renamed/ })).toBeInTheDocument();
  });

  it("deletes the selected note and selects the next note", async () => {
    confirmMock.mockResolvedValueOnce(true);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open vault" }));

    await waitFor(() => {
      expect(screen.getByTestId("editor-note")).toHaveTextContent("notes/a.md");
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));

    await waitFor(() => {
      expect(deleteNote).toHaveBeenCalledWith("notes/a.md", "/vault");
    });
    expect(removeSearchNote).toHaveBeenCalledWith("notes/a.md");
    expect(screen.queryByRole("button", { name: /Alpha/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("editor-note")).toHaveTextContent("notes/b.md");
  });

  it("filters the sidebar with the search query", async () => {
    searchNotes.mockResolvedValueOnce([
      {
        id: "notes/b.md",
        path: "notes/b.md",
        title: "Beta",
        body: "Beta body\n",
        isSecure: false,
        mtime: 100,
        createdAt: 100,
        tags: [],
      },
    ]);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open vault" }));

    await waitFor(() => {
      expect(restoreSearchIndex).toHaveBeenCalledWith("/vault", expect.any(Array));
    });

    fireEvent.change(screen.getByPlaceholderText("Search notes"), {
      target: { value: "beta" },
    });

    await waitFor(() => {
      expect(searchNotes).toHaveBeenCalledWith("beta", 50);
    });
    expect(screen.getByRole("button", { name: "Beta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alpha" })).not.toBeInTheDocument();
  });

  it("reloads clean external changes and marks dirty changes as conflicts", async () => {
    let alphaLoads = 0;
    loadNote.mockImplementation(async (id: string) => {
      if (id === "notes/a.md") {
        alphaLoads += 1;
        return makeNote(
          id,
          "Alpha",
          alphaLoads === 1 ? "Alpha body\n" : "Alpha from disk\n",
        );
      }
      if (id === "notes/b.md") {
        return makeNote(id, "Beta", "Beta body\n");
      }
      return null;
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open vault" }));

    await waitFor(() => {
      expect(screen.getByTestId("editor-note")).toHaveTextContent("notes/a.md");
    });

    await act(async () => {
      emitVaultEvent({ kind: "Modified", data: "notes/a.md" });
    });

    await waitFor(() => {
      expect(alphaLoads).toBe(2);
    });
    expect(screen.getByTestId("editor-value")).toHaveTextContent("Alpha from disk");

    fireEvent.click(screen.getByRole("button", { name: "Edit body" }));
    await act(async () => {
      emitVaultEvent({ kind: "Modified", data: "notes/a.md" });
    });

    await waitFor(() => {
      expect(screen.getByTestId("editor-conflict")).toHaveTextContent("yes");
    });
    expect(
      screen.getByText(/File changed on disk\. Reload or keep editing to preserve your draft\./),
    ).toBeInTheDocument();
  });

  it("prompts for a vault password before opening a secure note", async () => {
    vaultScan.mockResolvedValueOnce([
      makeScannedNote("notes/secret.md.sec", "Secret", {
        is_secure: true,
      }),
      makeScannedNote("notes/plain.md", "Plain"),
    ]);
    loadNote.mockImplementation(async (id: string) => {
      if (id === "notes/secret.md.sec") {
        return makeNote(id, "Secret", "Secret body\n", {
          isSecure: true,
        });
      }
      if (id === "notes/plain.md") {
        return makeNote(id, "Plain", "Plain body\n");
      }
      return null;
    });
    promptMock.mockResolvedValueOnce("vault-password");

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open vault" }));

    await waitFor(() => {
      expect(vaultUnlockSecure).toHaveBeenCalledWith("/vault", "vault-password");
    });
    expect(promptMock).toHaveBeenCalledWith("Vault password", {
      defaultValue: "",
    });
    expect(screen.getByTestId("editor-note")).toHaveTextContent("notes/secret.md.sec");
    expect(screen.getByTestId("editor-value")).toHaveTextContent("Secret body");
    expect(screen.getByRole("button", { name: "Make secure" })).toBeDisabled();
  });

  it("converts a plaintext note into a secure note after unlocking the vault", async () => {
    promptMock.mockResolvedValueOnce("vault-password");

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open vault" }));

    await waitFor(() => {
      expect(screen.getByTestId("editor-note")).toHaveTextContent("notes/a.md");
    });

    fireEvent.click(screen.getByRole("button", { name: "Make secure" }));

    await waitFor(() => {
      expect(vaultUnlockSecure).toHaveBeenCalledWith("/vault", "vault-password");
      expect(makeNoteSecure).toHaveBeenCalledWith(
        "notes/a.md",
        "/vault",
        "Alpha body\n",
      );
    });
    expect(screen.getByTestId("editor-note")).toHaveTextContent("notes/a.md.sec");
    expect(screen.getByRole("button", { name: /Alpha secured/ })).toBeInTheDocument();
  });

  it("subscribes to watcher events and cleans up on unmount", async () => {
    const { unmount } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open vault" }));

    await waitFor(() => {
      expect(vaultStartWatching).toHaveBeenCalledWith("/vault");
    });
    await waitFor(() => {
      expect(vaultEventHandlers.length).toBeGreaterThanOrEqual(2);
    });

    unmount();

    expect(vaultStopWatching).toHaveBeenCalled();
    await waitFor(() => {
      expect(vaultEventHandlers).toHaveLength(0);
    });
  });
});
