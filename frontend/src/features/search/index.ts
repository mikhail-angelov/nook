import type { ScannedNote } from "@/features/vault/types";

import type { ChatSessionMetadata } from "@/features/ai/sessions";
import { parseSearchQuery } from "./query";

export type SearchDocument = {
  id: string;
  path: string;
  title: string;
  body: string | null;
  is_secure: boolean;
  mtime: number;
  created_at: number;
  tags: string[];
  wikilinks: string[];
};

export type SearchHit = SearchDocument;

export type SearchSnapshot = {
  version: 1;
  notes: SearchDocument[];
};

type SearchIndex = {
  upsertNote(note: ScannedNote): void;
  upsertChatSession(session: ChatSessionMetadata): void;
  removeNote(noteId: string): void;
  removeChatSession(sessionId: string): void;
  search(query: string, limit?: number): SearchHit[];
  searchNotes(query: string, limit?: number): SearchHit[];
  searchChatSessions(query: string, limit?: number): SearchHit[];
  listNotes(): SearchDocument[];
  listChatSessions(): SearchDocument[];
  toJSON(): SearchSnapshot;
};

export function createSearchIndex(snapshot?: SearchSnapshot): SearchIndex {
  const notes = new Map<string, SearchDocument>();
  const chats = new Map<string, SearchDocument>();

  for (const note of snapshot?.notes ?? []) {
    notes.set(note.id, normalizeNote(note));
  }

  return {
    upsertNote(note) {
      const normalized = normalizeNote(note);
      if (normalized.is_secure) {
        notes.delete(normalized.id);
        return;
      }
      notes.set(normalized.id, normalized);
    },
    upsertChatSession(session) {
      chats.set(session.id, normalizeChatSession(session));
    },
    removeNote(noteId) {
      notes.delete(noteId);
    },
    removeChatSession(sessionId) {
      chats.delete(sessionId);
    },
    search(query, limit = 20) {
      return searchDocuments(notes.values(), query, limit);
    },
    searchNotes(query, limit = 20) {
      return searchDocuments(notes.values(), query, limit);
    },
    searchChatSessions(query, limit = 20) {
      return searchDocuments(chats.values(), query, limit);
    },
    listNotes() {
      return [...notes.values()];
    },
    listChatSessions() {
      return [...chats.values()];
    },
    toJSON() {
      return {
        version: 1,
        notes: [...notes.values()],
      };
    },
  };
}

function normalizeNote(note: SearchDocument | ScannedNote): SearchDocument {
  return {
    id: note.id,
    path: note.path,
    title: note.title,
    body: note.body ?? null,
    is_secure: note.is_secure,
    mtime: note.mtime,
    created_at: note.created_at,
    tags: [...(note.tags ?? [])],
    wikilinks: [...(note.wikilinks ?? [])],
  };
}

function normalizeChatSession(session: ChatSessionMetadata): SearchDocument {
  return {
    id: session.id,
    path: `.chats/${session.id}.meta.json`,
    title: session.title,
    body: session.summary.trim() ? session.summary : null,
    is_secure: false,
    mtime: session.updatedAt,
    created_at: session.startedAt,
    tags: [],
    wikilinks: [],
  };
}

function searchDocuments(
  documents: Iterable<SearchDocument>,
  query: string,
  limit: number,
): SearchHit[] {
  const parsed = parseSearchQuery(query);
  if (
    parsed.tags.length === 0 &&
    parsed.paths.length === 0 &&
    parsed.phrases.length === 0 &&
    parsed.terms.length === 0
  ) {
    return [];
  }

  return [...documents]
    .map((note) => ({ note, score: scoreNote(note, parsed) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.note.title.localeCompare(b.note.title, undefined, {
        sensitivity: "base",
      });
    })
    .slice(0, limit)
    .map((entry) => entry.note);
}

function scoreNote(
  note: SearchDocument,
  parsed: ReturnType<typeof parseSearchQuery>,
): number {
  const haystack = [note.title, note.body ?? "", ...note.tags].join("\n").toLowerCase();
  const loweredPath = note.path.toLowerCase();
  const loweredTags = note.tags.map((tag) => tag.toLowerCase());

  for (const tag of parsed.tags) {
    if (!loweredTags.includes(tag)) {
      return 0;
    }
  }

  for (const path of parsed.paths) {
    if (!loweredPath.includes(path)) {
      return 0;
    }
  }

  for (const phrase of parsed.phrases) {
    if (!haystack.includes(phrase)) {
      return 0;
    }
  }

  let score = 0;
  for (const term of parsed.terms) {
    if (!haystack.includes(term)) {
      return 0;
    }
    score += 3;
  }

  for (const phrase of parsed.phrases) {
    if (haystack.includes(phrase)) {
      score += 4;
    }
  }

  score += parsed.tags.length * 2;
  score += parsed.paths.length * 2;

  return score;
}
