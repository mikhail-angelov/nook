import type { ScannedNote } from "@/features/vault/types";
import type { ChatSessionMetadata } from "@/features/ai/sessions";

import { loadSearchCache, saveSearchCache } from "./cache";
import { createSearchIndex } from "./index";
import { reconcileSearchIndex } from "./reconcile";

export type SearchResult = {
  id: string;
  path: string;
  title: string;
  body: string | null;
  isSecure: boolean;
  mtime: number;
  createdAt: number;
  tags: string[];
};

let activeIndex = createSearchIndex();

/**
 * Search the notes FTS index. Blank queries return no results 
 */
export async function searchNotes(
  query: string,
  limit = 20,
): Promise<SearchResult[]> {
  const normalized = query.trim();
  if (!normalized) {
    return [];
  }
  return activeIndex.searchNotes(normalized, limit).map((note) => ({
    id: note.id,
    path: note.path,
    title: note.title,
    body: note.body,
    isSecure: note.is_secure,
    mtime: note.mtime,
    createdAt: note.created_at,
    tags: note.tags,
  }));
}

export async function searchChatSessions(
  query: string,
  limit = 20,
): Promise<SearchResult[]> {
  const normalized = query.trim();
  if (!normalized) {
    return [];
  }
  return activeIndex.searchChatSessions(normalized, limit).map((note) => ({
    id: note.id,
    path: note.path,
    title: note.title,
    body: note.body,
    isSecure: note.is_secure,
    mtime: note.mtime,
    createdAt: note.created_at,
    tags: note.tags,
  }));
}

export async function restoreSearchIndex(
  vaultRoot: string,
  scannedNotes: ScannedNote[],
  chatSessions: ChatSessionMetadata[] = [],
): Promise<void> {
  const cached = await loadSearchCache(vaultRoot);
  const index = createSearchIndex(cached ?? undefined);
  const result = reconcileSearchIndex(index, scannedNotes);
  replaceChatSessions(index, chatSessions);
  if (!cached || result.changed) {
    await saveSearchCache(vaultRoot, index);
  }
  activeIndex = index;
}

export function replaceSearchIndex(
  scannedNotes: ScannedNote[],
  chatSessions: ChatSessionMetadata[] = [],
): void {
  const index = createSearchIndex();
  for (const note of scannedNotes) {
    index.upsertNote(note);
  }
  replaceChatSessions(index, chatSessions);
  activeIndex = index;
}

export function upsertSearchNote(note: ScannedNote): void {
  activeIndex.upsertNote(note);
}

export function removeSearchNote(noteId: string): void {
  activeIndex.removeNote(noteId);
}

export function upsertSearchChatSession(session: ChatSessionMetadata): void {
  activeIndex.upsertChatSession(session);
}

export function removeSearchChatSession(sessionId: string): void {
  activeIndex.removeChatSession(sessionId);
}

function replaceChatSessions(
  index: {
    upsertChatSession(session: ChatSessionMetadata): void;
    listChatSessions(): Array<{ id: string }>;
    removeChatSession(sessionId: string): void;
  },
  chatSessions: ChatSessionMetadata[],
): void {
  const activeIds = new Set(index.listChatSessions().map((session) => session.id));
  for (const session of chatSessions) {
    index.upsertChatSession(session);
    activeIds.delete(session.id);
  }
  for (const sessionId of activeIds) {
    index.removeChatSession(sessionId);
  }
}
