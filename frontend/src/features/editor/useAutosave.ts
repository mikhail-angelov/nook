// Autosave hook — the contract is documented in design.md §Autosave.
//
// Trigger matrix:
//   * 2s debounce after the last body change (per note id)
//   * blur (caller invokes flush())
//   * `document.visibilitychange` → if hidden, flush
//   * `beforeunload` → flush (best-effort; async cannot block unload)
//   * switching note.id → flush the previous note's pending save first
//
// The hook deliberately accepts a caller-provided `save` function so the
// same mechanism can be reused by unrelated callers (e.g. attach-notes in
// Task 11).

import { useCallback, useEffect, useRef, useState } from "react";

import type { Note } from "@/features/vault/notes";

export type UseAutosaveOpts = {
  note: Note | null;
  draftBody: string;
  vaultRoot: string | null;
  save: (noteId: string, body: string, vaultRoot: string | null) => Promise<void>;
  debounceMs?: number;
};

export type UseAutosaveReturn = {
  /** Flush any pending save immediately. Safe to call even when idle. */
  flush: () => Promise<void>;
  pending: boolean;
};

const DEFAULT_DEBOUNCE_MS = 2000;

export function useAutosave(opts: UseAutosaveOpts): UseAutosaveReturn {
  const { note, draftBody, save, vaultRoot } = opts;
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  // Refs so we don't re-run the debounce effect on every keystroke-driven
  // render. Only `draftBody` changes need to schedule a save.
  const saveRef = useRef(save);
  saveRef.current = save;

  const draftRef = useRef(draftBody);
  draftRef.current = draftBody;

  // Track per-note-id state so switching notes behaves correctly.
  const currentIdRef = useRef<string | null>(note ? note.id : null);
  const lastSavedBodyRef = useRef<Map<string, string>>(new Map());
  const noteVaultRootRef = useRef<Map<string, string | null>>(new Map());
  const pendingBodyRef = useRef<Map<string, string>>(new Map());
  const pendingVaultRootRef = useRef<Map<string, string | null>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pending, setPending] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flushForId = useCallback(async (id: string): Promise<void> => {
    const body = pendingBodyRef.current.get(id);
    if (body === undefined) return;
    const vaultRoot = pendingVaultRootRef.current.get(id) ?? null;
    const lastSaved = lastSavedBodyRef.current.get(id);
    pendingBodyRef.current.delete(id);
    pendingVaultRootRef.current.delete(id);
    if (lastSaved === body) {
      // Nothing to do.
      return;
    }
    await saveRef.current(id, body, vaultRoot);
    lastSavedBodyRef.current.set(id, body);
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    clearTimer();
    const id = currentIdRef.current;
    if (!id) return;
    try {
      await flushForId(id);
    } finally {
      setPending(false);
    }
  }, [clearTimer, flushForId]);

  // Prime last-saved for a fresh note so we don't save immediately on load.
  useEffect(() => {
    if (!note) {
      currentIdRef.current = null;
      clearTimer();
      setPending(false);
      return;
    }
    const prevId = currentIdRef.current;
    if (prevId && prevId !== note.id) {
      // Flush the previous note before switching.
      void flushForId(prevId);
      clearTimer();
    }
    currentIdRef.current = note.id;
    if (prevId !== note.id || !noteVaultRootRef.current.has(note.id)) {
      noteVaultRootRef.current.set(note.id, vaultRoot);
    }
    if (!lastSavedBodyRef.current.has(note.id)) {
      lastSavedBodyRef.current.set(note.id, note.body ?? "");
    }
    // Don't schedule a save just because we switched.
    setPending(false);
  }, [note, clearTimer, flushForId, vaultRoot]);

  // Debounce schedule on draft change.
  useEffect(() => {
    const id = currentIdRef.current;
    if (!id) return;
    const lastSaved = lastSavedBodyRef.current.get(id);
    if (lastSaved === draftBody) {
      // No change vs disk; cancel any pending save.
      pendingBodyRef.current.delete(id);
      pendingVaultRootRef.current.delete(id);
      clearTimer();
      setPending(false);
      return;
    }
    pendingBodyRef.current.set(id, draftBody);
    if (!pendingVaultRootRef.current.has(id)) {
      pendingVaultRootRef.current.set(
        id,
        noteVaultRootRef.current.get(id) ?? vaultRoot,
      );
    }
    setPending(true);
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void (async () => {
        await flushForId(id);
        setPending(false);
      })();
    }, debounceMs);
    return () => {
      // cleanup handled by clearTimer above — no-op on unmount (we want the
      // final effect tick to remain scheduled).
    };
  }, [draftBody, debounceMs, clearTimer, flushForId, vaultRoot]);

  // Global triggers: visibility + beforeunload.
  useEffect(() => {
    const onVisibility = (): void => {
      if (typeof document !== "undefined" && document.hidden) {
        void flush();
      }
    };
    const onBeforeUnload = (): void => {
      void flush();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", onBeforeUnload);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", onBeforeUnload);
      }
    };
  }, [flush]);

  // Final flush on unmount.
  useEffect(() => {
    return () => {
      const id = currentIdRef.current;
      if (id) {
        void flushForId(id);
      }
      clearTimer();
    };
  }, [clearTimer, flushForId]);

  return { flush, pending };
}
