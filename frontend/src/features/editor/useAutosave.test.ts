import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Note } from "@/features/vault/notes";

import { useAutosave } from "./useAutosave";

const mkNote = (id: string, body = ""): Note => ({
  id,
  path: id,
  title: id,
  body,
  isSecure: false,
  mtime: 100,
  createdAt: 100,
});

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("debounces saves at 2000ms after the last change", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const note = mkNote("a.md", "initial");
    const { rerender } = renderHook(
      ({ draft }: { draft: string }) =>
        useAutosave({ note, draftBody: draft, save, vaultRoot: "/vault-a" }),
      { initialProps: { draft: "initial" } },
    );

    rerender({ draft: "changed" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("a.md", "changed", "/vault-a");
  });

  it("flush() saves immediately (blur scenario)", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const note = mkNote("a.md", "initial");
    const { result, rerender } = renderHook(
      ({ draft }: { draft: string }) =>
        useAutosave({ note, draftBody: draft, save, vaultRoot: "/vault-a" }),
      { initialProps: { draft: "initial" } },
    );
    rerender({ draft: "edited" });
    await act(async () => {
      await result.current.flush();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("a.md", "edited", "/vault-a");
  });

  it("switching note id flushes the previous note first", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const noteA = mkNote("a.md", "a-initial");
    const noteB = mkNote("b.md", "b-initial");

    type Props = { note: Note; draft: string };
    const { rerender } = renderHook(
      ({ note, draft }: Props) =>
        useAutosave({ note, draftBody: draft, save, vaultRoot: "/vault-a" }),
      { initialProps: { note: noteA, draft: "a-initial" } },
    );

    rerender({ note: noteA, draft: "a-edited" });
    // Switch before the debounce fires.
    rerender({ note: noteB, draft: "b-initial" });

    // Let the microtask queue drain for the switch-time flush.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("a.md", "a-edited", "/vault-a");

    // Now edit B and confirm the timer is independent.
    rerender({ note: noteB, draft: "b-edited" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("b.md", "b-edited", "/vault-a");
  });

  it("flushes the previous note with the previous note id", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const noteA = mkNote("a.md", "a-initial");
    const noteB = mkNote("b.md", "b-initial");

    type Props = { note: Note; draft: string };
    const { rerender } = renderHook(
      ({ note, draft }: Props) =>
        useAutosave({ note, draftBody: draft, save, vaultRoot: "/vault-a" }),
      { initialProps: { note: noteA, draft: "a-initial" } },
    );

    rerender({ note: noteA, draft: "a-edited" });
    rerender({ note: noteB, draft: "b-initial" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("a.md", "a-edited", "/vault-a");
  });

  it("does not save the same body twice in a row", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const note = mkNote("a.md", "initial");
    const { result, rerender } = renderHook(
      ({ draft }: { draft: string }) =>
        useAutosave({ note, draftBody: draft, save, vaultRoot: "/vault-a" }),
      { initialProps: { draft: "initial" } },
    );
    rerender({ draft: "v2" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("a.md", "v2", "/vault-a");

    // Flush with the same body — no new call.
    await act(async () => {
      await result.current.flush();
    });
    expect(save).toHaveBeenCalledTimes(1);

    // Even going through the debounce with an unchanged body should not fire.
    rerender({ draft: "v2" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(save).toHaveBeenCalledTimes(1);

    // Switching vault roots alone should not retarget an already-dirty note.
    rerender({ draft: "v2" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(save).toHaveBeenCalledWith("a.md", "v2", "/vault-a");
  });

  it("uses the note's original vault root when the vault prop changes", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const note = mkNote("a.md", "initial");
    const { rerender } = renderHook(
      ({ draft, vaultRoot }: { draft: string; vaultRoot: string }) =>
        useAutosave({ note, draftBody: draft, save, vaultRoot }),
      { initialProps: { draft: "initial", vaultRoot: "/vault-a" } },
    );

    rerender({ draft: "edited", vaultRoot: "/vault-b" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(save).toHaveBeenCalledWith("a.md", "edited", "/vault-a");
  });
});
