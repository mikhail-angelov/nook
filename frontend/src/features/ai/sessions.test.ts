import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatSessionMetadata, ChatSessionMessage } from "./sessions";

const createNote = vi.fn();
const chatAppendSessionLine = vi.fn();
const chatReadSessionFile = vi.fn();
const chatListSessionIds = vi.fn();
const chatReadSessionMeta = vi.fn();
const chatWriteSessionMeta = vi.fn();
const chatRenameSession = vi.fn();
const chatDeleteSession = vi.fn();

vi.mock("@/features/vault/notes", () => ({
  createNote: (...args: unknown[]) => createNote(...args),
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    chatAppendSessionLine: (...args: unknown[]) => chatAppendSessionLine(...args),
    chatReadSessionFile: (...args: unknown[]) => chatReadSessionFile(...args),
    chatListSessionIds: (...args: unknown[]) => chatListSessionIds(...args),
    chatReadSessionMeta: (...args: unknown[]) => chatReadSessionMeta(...args),
    chatWriteSessionMeta: (...args: unknown[]) => chatWriteSessionMeta(...args),
    chatRenameSession: (...args: unknown[]) => chatRenameSession(...args),
    chatDeleteSession: (...args: unknown[]) => chatDeleteSession(...args),
  };
});

import {
  appendChatSessionMessage,
  buildSessionExtractNoteBody,
  deleteChatSession,
  chatSessionFilePath,
  chatSessionMetaPath,
  extractSessionMessagesToNote,
  listChatSessions,
  loadChatSession,
  rebuildChatSessionMeta,
  renameChatSession,
  updateChatSessionMetadata,
  type ChatSession,
} from "./sessions";

beforeEach(() => {
  createNote.mockReset();
  chatAppendSessionLine.mockReset();
  chatReadSessionFile.mockReset();
  chatListSessionIds.mockReset();
  chatReadSessionMeta.mockReset();
  chatWriteSessionMeta.mockReset();
  chatRenameSession.mockReset();
  chatDeleteSession.mockReset();
});

function makeMessage(overrides: Partial<ChatSessionMessage> = {}): ChatSessionMessage {
  return {
    role: overrides.role ?? "user",
    content: overrides.content ?? "Hello",
    ts: overrides.ts ?? 100,
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-4o-mini",
    attachments: overrides.attachments,
  };
}

function makeMetadata(overrides: Partial<ChatSessionMetadata> = {}): ChatSessionMetadata {
  return {
    id: overrides.id ?? "2026-04-20-abc123",
    title: overrides.title ?? "Hello",
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-4o-mini",
    systemPrompt: overrides.systemPrompt ?? "",
    summary: overrides.summary ?? "",
    startedAt: overrides.startedAt ?? 100,
    updatedAt: overrides.updatedAt ?? 200,
    messageCount: overrides.messageCount ?? 1,
  };
}

function serializeMetadataForFile(metadata: ChatSessionMetadata): string {
  return JSON.stringify({
    id: metadata.id,
    title: metadata.title,
    provider: metadata.provider,
    model: metadata.model,
    systemPrompt: metadata.systemPrompt,
    summary: metadata.summary,
    started_at: metadata.startedAt,
    updated_at: metadata.updatedAt,
    message_count: metadata.messageCount,
  });
}

describe("chat sessions", () => {
  it("appends lines and syncs metadata", async () => {
    chatReadSessionFile.mockResolvedValueOnce(JSON.stringify(makeMessage()));
    chatReadSessionMeta.mockResolvedValueOnce(null);

    const message = makeMessage();
    await appendChatSessionMessage({
      vaultRoot: "/vault",
      sessionId: "2026-04-20-abc123",
      message,
    });

    expect(chatAppendSessionLine).toHaveBeenCalledWith(
      "/vault",
      "2026-04-20-abc123",
      JSON.stringify(message),
    );
    expect(chatWriteSessionMeta).toHaveBeenCalledWith(
      "/vault",
      "2026-04-20-abc123",
      expect.stringContaining('"message_count":1'),
    );
  });

  it("loads sessions while skipping a malformed trailing line", async () => {
    chatReadSessionFile.mockResolvedValueOnce(
      `${JSON.stringify(makeMessage())}\nnot-json`,
    );
    chatReadSessionMeta.mockResolvedValueOnce(
      serializeMetadataForFile(makeMetadata()),
    );

    const session = await loadChatSession({
      vaultRoot: "/vault",
      sessionId: "2026-04-20-abc123",
    });

    expect(session.messages).toHaveLength(1);
    expect(session.messages[0]?.content).toBe("Hello");
    expect(session.metadata.title).toBe("Hello");
    expect(session.metadata.summary).toBe("");
  });

  it("lists chat sessions and rebuilds metadata when the sidecar is missing", async () => {
    chatListSessionIds.mockResolvedValueOnce([
      "2026-04-20-abc123",
      "2026-04-19-old",
    ]);
    chatReadSessionMeta
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        serializeMetadataForFile(
          makeMetadata({ id: "2026-04-19-old", title: "Old title" }),
        ),
      );
    chatReadSessionFile
      .mockResolvedValueOnce(`${JSON.stringify(makeMessage())}\n`)
      .mockResolvedValueOnce(JSON.stringify(makeMessage({ content: "Old", ts: 50 })));

    const sessions = await listChatSessions({ vaultRoot: "/vault", limit: 10 });

    expect(chatListSessionIds).toHaveBeenCalledWith("/vault");
    expect(chatWriteSessionMeta).toHaveBeenCalledWith(
      "/vault",
      "2026-04-20-abc123",
      expect.stringContaining('"title":"Hello"'),
    );
    expect(sessions.map((session) => session.id)).toEqual([
      "2026-04-20-abc123",
      "2026-04-19-old",
    ]);
  });

  it("extracts messages to a note body", () => {
    const session = makeMetadata();
    const body = buildSessionExtractNoteBody({
      session,
      messages: [makeMessage(), makeMessage({ role: "assistant", content: "World" })],
    });

    expect(body).toContain("source_session: .chats/2026-04-20-abc123.jsonl");
    expect(body).toContain("### user");
    expect(body).toContain("### assistant");
  });

  it("extracts session messages into a new note", async () => {
    createNote.mockResolvedValueOnce(undefined);

    await extractSessionMessagesToNote({
      vaultRoot: "/vault",
      notePath: "notes/extracted.md",
      session: makeMetadata(),
      messages: [makeMessage(), makeMessage({ role: "assistant", content: "World" })],
    });

    expect(createNote).toHaveBeenCalledWith(
      "/vault",
      "notes/extracted.md",
      expect.stringContaining("source_session: .chats/2026-04-20-abc123.jsonl"),
    );
  });

  it("rebuilds metadata from the transcript when requested", async () => {
    chatReadSessionFile.mockResolvedValueOnce(
      `${JSON.stringify(makeMessage())}\n${JSON.stringify(makeMessage({ role: "assistant", content: "World", ts: 200 }))}`,
    );
    chatReadSessionMeta.mockResolvedValueOnce(null);

    const meta = await rebuildChatSessionMeta({
      vaultRoot: "/vault",
      sessionId: "2026-04-20-abc123",
    });

    expect(meta.title).toBe("Hello");
    expect(meta.messageCount).toBe(2);
    expect(meta.summary).toBe("");
    expect(chatWriteSessionMeta).toHaveBeenCalled();
  });

  it("updates session metadata without changing the derived identity fields", async () => {
    chatReadSessionMeta.mockResolvedValueOnce(
      serializeMetadataForFile(
        makeMetadata({
          id: "2026-04-20-abc123",
          title: "Hello",
          provider: "openai",
          model: "gpt-4o-mini",
          systemPrompt: "Old prompt",
        }),
      ),
    );

    const meta = await updateChatSessionMetadata({
      vaultRoot: "/vault",
      sessionId: "2026-04-20-abc123",
      patch: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        systemPrompt: "New prompt",
      },
    });

    expect(meta.id).toBe("2026-04-20-abc123");
    expect(meta.startedAt).toBe(100);
    expect(meta.messageCount).toBe(1);
    expect(chatWriteSessionMeta).toHaveBeenCalledWith(
      "/vault",
      "2026-04-20-abc123",
      expect.stringContaining('"systemPrompt":"New prompt"'),
    );
  });

  it("builds the expected vault-relative file paths", () => {
    expect(chatSessionFilePath("/vault", "2026-04-20-abc123")).toBe(
      "/vault/.chats/2026-04-20-abc123.jsonl",
    );
    expect(chatSessionMetaPath("/vault", "2026-04-20-abc123")).toBe(
      "/vault/.chats/2026-04-20-abc123.meta.json",
    );
  });

  it("renames and deletes sessions through the bridge", async () => {
    chatRenameSession.mockResolvedValueOnce(undefined);
    chatDeleteSession.mockResolvedValueOnce(undefined);
    chatReadSessionFile.mockResolvedValueOnce(JSON.stringify(makeMessage()));
    chatReadSessionMeta.mockResolvedValueOnce(
      serializeMetadataForFile(makeMetadata()),
    );

    const renamed = await renameChatSession({
      vaultRoot: "/vault",
      oldSessionId: "2026-04-20-abc123",
      newSessionId: "2026-04-20-renamed",
    });
    await deleteChatSession({
      vaultRoot: "/vault",
      sessionId: renamed.id,
    });

    expect(chatRenameSession).toHaveBeenCalledWith(
      "/vault",
      "2026-04-20-abc123",
      "2026-04-20-renamed",
    );
    expect(chatDeleteSession).toHaveBeenCalledWith(
      "/vault",
      "2026-04-20-renamed",
    );
  });
});
