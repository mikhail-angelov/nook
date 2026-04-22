import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AiProvider } from "./provider";
import type { ChatSession, ChatSessionMetadata } from "./sessions";

const searchNotes = vi.fn();
const extractSessionMessagesToNote = vi.fn();
const updateChatSessionMetadata = vi.fn();
const listChatSessions = vi.fn();
const loadChatSession = vi.fn();
const appendChatSessionMessage = vi.fn();
const createChatSessionId = vi.fn();

vi.mock("./sessions", async () => {
  const actual = await vi.importActual<typeof import("./sessions")>("./sessions");
  return {
    ...actual,
    createChatSessionId: (...args: unknown[]) => createChatSessionId(...args),
    listChatSessions: (...args: unknown[]) => listChatSessions(...args),
    loadChatSession: (...args: unknown[]) => loadChatSession(...args),
    appendChatSessionMessage: (...args: unknown[]) => appendChatSessionMessage(...args),
    extractSessionMessagesToNote: (...args: unknown[]) => extractSessionMessagesToNote(...args),
    updateChatSessionMetadata: (...args: unknown[]) => updateChatSessionMetadata(...args),
  };
});

vi.mock("@/features/search/search", () => ({
  searchNotes: (...args: unknown[]) => searchNotes(...args),
}));

import { ChatPanel } from "./ChatPanel";

function makeProvider(chatImpl?: AiProvider["chat"]): AiProvider {
  return {
    id: "openai",
    defaultModel: "gpt-4o-mini",
    contextWindow: () => 128000,
    listModels: async () => [],
    chat:
      chatImpl ??
      ((messages, opts) => {
        expect(messages[messages.length - 1]?.content).toBe("How are you?");
        expect(opts.model).toBe("gpt-4o-mini");
        return (async function* () {
          yield { type: "text", text: "Hel" };
          yield { type: "text", text: "lo" };
        })();
      }),
  };
}

function makeSessionMetadata(overrides: Partial<ChatSessionMetadata> = {}): ChatSessionMetadata {
  return {
    id: overrides.id ?? "2024-04-20-124000-new",
    title: overrides.title ?? "Newer",
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-4o-mini",
    systemPrompt: overrides.systemPrompt ?? "",
    summary: overrides.summary ?? "user: Hello",
    startedAt: overrides.startedAt ?? 100,
    updatedAt: overrides.updatedAt ?? 200,
    messageCount: overrides.messageCount ?? 1,
  };
}

function makeSession(metadata: ChatSessionMetadata): ChatSession {
  return {
    id: metadata.id,
    metadata,
    messages: [
      {
        role: "user",
        content: "Hello",
        ts: 100,
        provider: metadata.provider,
        model: metadata.model,
      },
    ],
  };
}

function makeSearchResult(overrides: Partial<{ id: string; title: string; path: string; body: string | null }>) {
  return {
    id: overrides.id ?? "notes/roadmap.md",
    title: overrides.title ?? "Roadmap",
    path: overrides.path ?? "notes/roadmap.md",
    body: overrides.body ?? "Roadmap bullets",
    isSecure: false,
    mtime: 100,
    createdAt: 100,
    tags: [],
  };
}

describe("ChatPanel", () => {
  beforeEach(() => {
    createChatSessionId.mockReset();
    createChatSessionId.mockReturnValue("draft-1");
    searchNotes.mockReset();
    extractSessionMessagesToNote.mockReset();
    updateChatSessionMetadata.mockReset();
    listChatSessions.mockReset();
    loadChatSession.mockReset();
    appendChatSessionMessage.mockReset();
    listChatSessions.mockResolvedValue([makeSessionMetadata()]);
    loadChatSession.mockResolvedValue(makeSession(makeSessionMetadata()));
    appendChatSessionMessage.mockResolvedValue(undefined);
    searchNotes.mockResolvedValue([]);
    extractSessionMessagesToNote.mockResolvedValue(undefined);
    updateChatSessionMetadata.mockResolvedValue(makeSessionMetadata());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads sessions, switches between them, assembles the prompt, and streams a reply", async () => {
    listChatSessions.mockResolvedValueOnce([
      makeSessionMetadata({
        id: "2026-04-20-abc123",
        title: "First session",
        provider: "openai",
        model: "gpt-4o-mini",
        systemPrompt: "Be brief.",
      }),
      makeSessionMetadata({
        id: "2026-04-21-def456",
        title: "Second session",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        systemPrompt: "Use the attached notes.",
      }),
    ]);
    loadChatSession.mockImplementation(async ({ sessionId }: { sessionId: string }) =>
      makeSession(
        makeSessionMetadata({
          id: sessionId,
          title: sessionId === "2026-04-21-def456" ? "Second session" : "First session",
          provider: sessionId === "2026-04-21-def456" ? "anthropic" : "openai",
          model: sessionId === "2026-04-21-def456" ? "claude-sonnet-4-6" : "gpt-4o-mini",
          systemPrompt: sessionId === "2026-04-21-def456" ? "Use the attached notes." : "Be brief.",
        }),
      ),
    );
    searchNotes.mockResolvedValueOnce([makeSearchResult({ id: "notes/roadmap.md" })]);

    render(
      <ChatPanel
        vaultRoot="/vault"
        resolveProvider={async (providerId) =>
          providerId === "anthropic"
            ? ({
                id: "anthropic",
                defaultModel: "claude-sonnet-4-6",
                contextWindow: () => 200000,
                listModels: async () => [
                  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: 200000 },
                ],
                chat(messages, opts) {
                  expect(opts.model).toBe("claude-sonnet-4-6");
                  expect(opts.system).toContain("Use the attached notes.");
                  expect(opts.system).toContain("Roadmap");
                  expect(messages[messages.length - 1]?.content).toBe("How are you?");
                  return (async function* () {
                    yield { type: "text", text: "Hel" };
                    yield { type: "text", text: "lo" };
                  })();
                },
              } satisfies AiProvider)
            : makeProvider((messages, opts) => {
                expect(opts.system).toContain("Use the attached notes.");
                expect(opts.system).toContain("Roadmap");
                expect(opts.system).toContain("```");
                expect(messages[messages.length - 1]?.content).toBe("How are you?");
                return (async function* () {
                  yield { type: "text", text: "Hel" };
                  yield { type: "text", text: "lo" };
                })();
              })
        }
        requestApiKey={vi.fn()}
        requestExtractPath={async () => "notes/extracted.md"}
      />,
    );

    await waitFor(() => {
      expect(listChatSessions).toHaveBeenCalledWith({ vaultRoot: "/vault", limit: 25 });
    });
    expect(screen.getByRole("button", { name: "First session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Second session" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Second session" }));
    await waitFor(() =>
      expect(loadChatSession).toHaveBeenCalledWith({
        vaultRoot: "/vault",
        sessionId: "2026-04-21-def456",
      }),
    );
    expect(screen.getByDisplayValue("Use the attached notes.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("System prompt"), {
      target: { value: "Focus on decisions." },
    });
    await waitFor(() => {
      expect(updateChatSessionMetadata).toHaveBeenCalledWith({
        vaultRoot: "/vault",
        sessionId: "2026-04-21-def456",
        patch: { systemPrompt: "Focus on decisions." },
      });
    });

    fireEvent.change(screen.getByLabelText("Attachment search"), {
      target: { value: "roadmap" },
    });
    await waitFor(() => {
      expect(searchNotes).toHaveBeenCalledWith("roadmap", 10);
    });
    fireEvent.click(screen.getByRole("button", { name: "Attach Roadmap" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Remove Roadmap")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "How are you?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(appendChatSessionMessage).toHaveBeenCalledTimes(2);
    });

    expect(appendChatSessionMessage.mock.calls[0][0]).toMatchObject({
      vaultRoot: "/vault",
      sessionId: "2026-04-21-def456",
      message: {
        role: "user",
        content: "How are you?",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        attachments: ["notes/roadmap.md"],
      },
    });
    expect(appendChatSessionMessage.mock.calls[1][0]).toMatchObject({
      sessionId: "2026-04-21-def456",
      message: {
        role: "assistant",
        content: "Hello",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
      },
    });
    expect(screen.getAllByText("Hello")).toHaveLength(2);
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("can start a new chat", async () => {
    listChatSessions.mockResolvedValueOnce([
      makeSessionMetadata({
        id: "2026-04-20-abc123",
        title: "Existing session",
      }),
    ]);
    loadChatSession.mockResolvedValueOnce(
      makeSession(
        makeSessionMetadata({
          id: "2026-04-20-abc123",
          title: "Existing session",
        }),
      ),
    );

    render(
      <ChatPanel
        vaultRoot="/vault"
        resolveProvider={async () => makeProvider()}
        requestApiKey={vi.fn()}
        requestExtractPath={async () => "notes/extracted.md"}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Existing session" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    await waitFor(() => {
      expect(createChatSessionId).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByText("Start a conversation.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Extract note" })).toBeDisabled();
  });

  it("warns when the assembled prompt exceeds the token budget", async () => {
    listChatSessions.mockResolvedValueOnce([
      makeSessionMetadata({
        id: "2026-04-22-budget",
        title: "Budget session",
        provider: "openai",
        model: "gpt-4o-mini",
      }),
    ]);
    loadChatSession.mockResolvedValueOnce(
      makeSession(
        makeSessionMetadata({
          id: "2026-04-22-budget",
          title: "Budget session",
          provider: "openai",
          model: "gpt-4o-mini",
        }),
      ),
    );
    searchNotes.mockResolvedValueOnce([
      makeSearchResult({
        id: "notes/long.md",
        title: "Long note",
        body: "x".repeat(200),
      }),
    ]);

    render(
      <ChatPanel
        vaultRoot="/vault"
        resolveProvider={async () =>
          ({
            id: "anthropic",
            defaultModel: "claude-sonnet-4-6",
            contextWindow: () => 10,
            listModels: async () => [
              { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: 10 },
            ],
            chat: async function* () {
              yield { type: "text", text: "ok" };
            },
          } satisfies AiProvider)
        }
        requestApiKey={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Budget session" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Provider"), {
      target: { value: "anthropic" },
    });

    fireEvent.change(screen.getByLabelText("Attachment search"), {
      target: { value: "long" },
    });
    await waitFor(() => {
      expect(searchNotes).toHaveBeenCalledWith("long", 10);
    });
    fireEvent.click(screen.getByRole("button", { name: "Attach Long note" }));

    await waitFor(() => {
      expect(
        screen.getByText(/close to the model token limit/i),
      ).toBeInTheDocument();
    });
  });
});
