import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { searchNotes } from "@/features/search/search";

import {
  appendChatSessionMessage,
  createChatSessionId,
  extractSessionMessagesToNote,
  listChatSessions,
  loadChatSession,
  updateChatSessionMetadata,
  type ChatSession,
  type ChatSessionMetadata,
  type ChatSessionMessage,
} from "./sessions";
import { type AiModel, type AiProvider, type AiProviderId } from "./provider";

const PROVIDERS: Array<{ id: AiProviderId; label: string }> = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "deepseek", label: "DeepSeek" },
];

type ChatPanelProps = {
  vaultRoot: string | null;
  resolveProvider(providerId: AiProviderId): Promise<AiProvider | null>;
  requestApiKey(providerId: AiProviderId): Promise<string | null>;
  requestExtractPath?: () => Promise<string | null>;
};

type AttachedNote = {
  id: string;
  title: string;
  body: string | null;
};

type SessionDraft = ChatSessionMetadata;

function createDraftSession(provider: AiProviderId, model: string): SessionDraft {
  const id = createChatSessionId();
  const now = Date.now();
  return {
    id,
    title: "New chat",
    provider,
    model,
    systemPrompt: "",
    summary: "",
    startedAt: now,
    updatedAt: now,
    messageCount: 0,
  };
}

function isAiProviderId(value: string): value is AiProviderId {
  return value === "anthropic" || value === "openai" || value === "deepseek";
}

export function ChatPanel({
  vaultRoot,
  resolveProvider,
  requestApiKey,
  requestExtractPath,
}: ChatPanelProps) {
  const [sessions, setSessions] = useState<ChatSessionMetadata[]>([]);
  const [draftSession, setDraftSession] = useState<SessionDraft>(() =>
    createDraftSession("openai", "gpt-4o-mini"),
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatSessionMessage[]>([]);
  const [providerId, setProviderId] = useState<AiProviderId>("openai");
  const [provider, setProvider] = useState<AiProvider | null>(null);
  const [models, setModels] = useState<AiModel[]>([]);
  const [model, setModel] = useState("gpt-4o-mini");
  const [draft, setDraft] = useState("");
  const [attachmentQuery, setAttachmentQuery] = useState("");
  const [attachmentResults, setAttachmentResults] = useState<AttachedNote[]>([]);
  const [attachedNotes, setAttachedNotes] = useState<AttachedNote[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const providerCache = useRef(new Map<AiProviderId, AiProvider>());
  const activeSession = useMemo(
    () =>
      sessions.find((session) => session.id === activeSessionId) ??
      (activeSessionId === draftSession.id ? draftSession : null),
    [activeSessionId, draftSession, sessions],
  );

  const visibleSessions = useMemo(() => {
    if (
      activeSession &&
      !sessions.some((session) => session.id === activeSession.id)
    ) {
      return [activeSession, ...sessions];
    }
    return sessions;
  }, [activeSession, sessions]);

  async function resolveAndCacheProvider(nextProviderId: AiProviderId) {
    const cached = providerCache.current.get(nextProviderId);
    if (cached) {
      return cached;
    }

    let resolved = await resolveProvider(nextProviderId);
    if (!resolved) {
      const apiKey = await requestApiKey(nextProviderId);
      if (apiKey) {
        resolved = await resolveProvider(nextProviderId);
      }
    }

    if (resolved) {
      providerCache.current.set(nextProviderId, resolved);
    }
    return resolved;
  }

  async function applyProviderSelection(
    nextProviderId: AiProviderId,
    nextModel?: string,
  ) {
    setLoadingProvider(true);
    setStatus(null);
    try {
      const resolved = await resolveAndCacheProvider(nextProviderId);
      setProviderId(nextProviderId);
      setProvider(resolved);
      setModels([]);
      if (resolved) {
        const providerModels = await resolved.listModels().catch(() => []);
        setModels(providerModels);
        setModel(nextModel ?? resolved.defaultModel);
      } else {
        setModel(nextModel ?? "gpt-4o-mini");
      }
      if (activeSessionId === draftSession.id) {
        setDraftSession((current) => ({
          ...current,
          provider: nextProviderId,
          model: nextModel ?? resolved?.defaultModel ?? current.model,
        }));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Provider unavailable");
      setProvider(null);
    } finally {
      setLoadingProvider(false);
    }
  }

  async function refreshSessions() {
    if (!vaultRoot) {
      setSessions([]);
      return;
    }
    setLoadingSessions(true);
    try {
      const rows = await listChatSessions({ vaultRoot, limit: 25 });
      setSessions(rows);
      if (rows.length > 0) {
        setActiveSessionId((current) => current ?? rows[0].id);
      } else {
        setActiveSessionId((current) => current ?? draftSession.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Failed to load sessions: ${message}`);
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }

  async function openSession(session: ChatSessionMetadata) {
    setStatus(null);
    setActiveSessionId(session.id);
    setAttachedNotes([]);
  }

  function startNewChat() {
    const nextDraft = createDraftSession(providerId, model);
    setDraftSession(nextDraft);
    setActiveSessionId(nextDraft.id);
    setMessages([]);
    setDraft("");
    setAttachedNotes([]);
    setAttachmentQuery("");
    setAttachmentResults([]);
    setStatus(null);
  }

  useEffect(() => {
    void refreshSessions();
    setDraftSession((current) => ({
      ...current,
      provider: providerId,
      model,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultRoot]);

  useEffect(() => {
    if (activeSessionId && activeSessionId === draftSession.id) {
      setDraftSession((current) => ({
        ...current,
        provider: providerId,
        model,
      }));
    }
  }, [activeSessionId, draftSession.id, model, providerId]);

  useEffect(() => {
    let cancelled = false;
    const query = attachmentQuery.trim();
    if (!query) {
      setAttachmentResults([]);
      return;
    }
    void (async () => {
      const results = await searchNotes(query, 10);
      if (!cancelled) {
        setAttachmentResults(
          results.map((result) => ({
            id: result.id,
            title: result.title,
            body: result.body,
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachmentQuery]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }
    const selected = sessions.find((session) => session.id === activeSessionId);
    if (!selected) {
      if (activeSessionId === draftSession.id) {
        setMessages([]);
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const loaded: ChatSession = vaultRoot
          ? await loadChatSession({
              vaultRoot,
              sessionId: selected.id,
            })
          : {
              id: selected.id,
              messages: [],
              metadata: selected,
            };
        if (cancelled) {
          return;
        }
        setMessages(loaded.messages);
        await applyProviderSelection(selected.provider, selected.model);
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Failed to open session");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, sessions, vaultRoot]);

  async function ensureActiveSessionId(): Promise<string | null> {
    if (!vaultRoot) {
      setStatus("Open a vault first.");
      return null;
    }
    if (activeSessionId) {
      return activeSessionId;
    }
    const nextDraft = createDraftSession(providerId, model);
    setDraftSession(nextDraft);
    setActiveSessionId(nextDraft.id);
    return nextDraft.id;
  }

  async function ensureProviderForSend() {
    const resolved = provider ?? (await resolveAndCacheProvider(providerId));
    if (resolved) {
      setProvider(resolved);
      return resolved;
    }
    const apiKey = await requestApiKey(providerId);
    if (!apiKey) {
      return null;
    }
    const retry = await resolveAndCacheProvider(providerId);
    if (retry) {
      setProvider(retry);
    }
    return retry;
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) {
      return;
    }

    const sessionId = await ensureActiveSessionId();
    if (!sessionId || !vaultRoot) {
      return;
    }
    const resolvedProvider = await ensureProviderForSend();
    if (!resolvedProvider) {
      setStatus(`No ${providerId} API key available.`);
      return;
    }

    setSending(true);
    setStatus(null);
    const userMessage: ChatSessionMessage = {
      role: "user",
      content: text,
      ts: Date.now(),
      provider: resolvedProvider.id,
      model,
      attachments:
        attachedNotes.length > 0 ? attachedNotes.map((note) => note.id) : undefined,
    };
    const userTranscript = [...messages, userMessage];
    setMessages(userTranscript);
    setDraft("");

    try {
      const activeSystemPrompt =
        activeSessionId === draftSession.id
          ? draftSession.systemPrompt
          : activeSession?.systemPrompt ?? "";
      const system = buildSystemPrompt(activeSystemPrompt, attachedNotes);
      const tokenBudget = resolvedProvider.contextWindow(model);
      if (system && tokenBudget > 0 && approximateTokens(system) > tokenBudget * 0.7) {
        setStatus("Attached notes may exceed 70% of the model context window.");
      }

      await appendChatSessionMessage({
        vaultRoot,
        sessionId,
        message: userMessage,
      });

      let assistantText = "";
      const stream = resolvedProvider.chat(
        userTranscript.map(({ role, content }) => ({ role, content })),
        {
          model,
          system: system || undefined,
        },
      );

      for await (const delta of stream) {
        assistantText += delta.text;
        setMessages((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          const assistantMessage: ChatSessionMessage = {
            role: "assistant",
            content: assistantText,
            ts: Date.now(),
            provider: resolvedProvider.id,
            model,
          };
          if (last?.role === "assistant") {
            next[next.length - 1] = assistantMessage;
          } else {
            next.push(assistantMessage);
          }
          return next;
        });
      }

      const assistantMessage: ChatSessionMessage = {
        role: "assistant",
        content: assistantText,
        ts: Date.now(),
        provider: resolvedProvider.id,
        model,
      };
      await appendChatSessionMessage({
        vaultRoot,
        sessionId,
        message: assistantMessage,
      });
      setMessages([...userTranscript, assistantMessage]);
      if (sessionId === draftSession.id) {
        setDraftSession((current) => ({
          ...current,
          provider: resolvedProvider.id,
          model,
          messageCount: userTranscript.length + 1,
          updatedAt: assistantMessage.ts,
        }));
      }
      setAttachedNotes([]);
      setAttachmentQuery("");
      setAttachmentResults([]);
      if (sessionId !== draftSession.id) {
        await refreshSessions();
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function handleExtractNote() {
    if (!vaultRoot) {
      return;
    }
    const session = activeSession ?? draftSession;
    const notePath = (await requestExtractPath?.()) ?? "notes/new-note.md";
    if (!notePath) {
      return;
    }
    await extractSessionMessagesToNote({
      vaultRoot,
      notePath,
      session,
      messages,
    });
  }

  const activeMessageCount = messages.length;
  const activeSystemPrompt =
    activeSessionId === draftSession.id
      ? draftSession.systemPrompt
      : activeSession?.systemPrompt ?? "";
  const promptNearLimit =
    buildSystemPrompt(activeSystemPrompt, attachedNotes).trim().length > 0 &&
    provider &&
    provider.contextWindow(model) > 0 &&
    approximateTokens(buildSystemPrompt(activeSystemPrompt, attachedNotes)) >
      provider.contextWindow(model) * 0.7;

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-l border-border bg-background">
      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Session sidebar"
          className="flex w-64 shrink-0 flex-col border-r border-border bg-muted/20"
        >
          <div className="border-b border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Sessions
              </div>
              <button
                type="button"
                onClick={startNewChat}
                className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
              >
                New chat
              </button>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {loadingSessions
                ? "Loading…"
                : `${visibleSessions.length} session${visibleSessions.length === 1 ? "" : "s"}`}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 text-xs">
            {visibleSessions.length === 0 ? (
              <div className="p-2 text-muted-foreground">No chat sessions yet.</div>
            ) : (
              <ul className="space-y-1">
                {visibleSessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      aria-label={session.title}
                      className={`w-full rounded px-2 py-1 text-left hover:bg-muted ${
                        session.id === activeSessionId ? "bg-muted font-medium" : ""
                      }`}
                      onClick={() => void openSession(session)}
                      title={session.id}
                    >
                      <div className="truncate">{session.title}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {session.provider} · {session.model}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold tracking-tight">
                  {activeSession?.title ?? "New chat"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {activeMessageCount} message{activeMessageCount === 1 ? "" : "s"}
                </div>
              </div>
              <button
                type="button"
                className="rounded border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
                onClick={() => {
                  void handleExtractNote();
                }}
                disabled={!vaultRoot || messages.length === 0}
              >
                Extract note
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_220px]">
              <label className="block">
                <span className="sr-only">System prompt</span>
                <textarea
                  aria-label="System prompt"
                  value={activeSystemPrompt}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (activeSessionId === draftSession.id) {
                      setDraftSession((current) => ({
                        ...current,
                        systemPrompt: next,
                      }));
                      return;
                    }
                    if (!vaultRoot || !activeSessionId) {
                      return;
                    }
                    void updateChatSessionMetadata({
                      vaultRoot,
                      sessionId: activeSessionId,
                      patch: { systemPrompt: next },
                    }).then((metadata) => {
                      setSessions((current) =>
                        current.map((session) =>
                          session.id === metadata.id ? metadata : session,
                        ),
                      );
                    });
                  }}
                  placeholder="Optional system prompt"
                  className="min-h-20 w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none"
                />
              </label>
              <div className="space-y-2">
                <label className="block">
                  <span className="sr-only">Attachment search</span>
                  <input
                    aria-label="Attachment search"
                    value={attachmentQuery}
                    onChange={(event) => setAttachmentQuery(event.target.value)}
                    placeholder="Search notes to attach"
                    className="h-10 w-full rounded border border-border bg-background px-3 text-sm outline-none"
                  />
                </label>
                {attachedNotes.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {attachedNotes.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        aria-label={`Remove ${note.title}`}
                        onClick={() => {
                          setAttachedNotes((current) =>
                            current.filter((entry) => entry.id !== note.id),
                          );
                        }}
                        className="rounded-full border border-border px-2 py-1 text-xs"
                      >
                        {note.title}
                      </button>
                    ))}
                  </div>
                ) : null}
                {attachmentResults.length > 0 ? (
                  <div className="space-y-1">
                    {attachmentResults.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => {
                          setAttachedNotes((current) =>
                            current.some((entry) => entry.id === note.id)
                              ? current
                              : [...current, note],
                          );
                        }}
                        className="w-full rounded border border-border px-2 py-1 text-left text-xs hover:bg-muted"
                      >
                        {`Attach ${note.title}`}
                      </button>
                    ))}
                  </div>
                ) : null}
                {promptNearLimit ? (
                  <div className="text-xs text-amber-700">
                    Attached notes are close to the model token limit.
                  </div>
                ) : null}
              </div>
            </div>
            {status ? <div className="mt-2 text-xs text-red-600">{status}</div> : null}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="text-sm text-muted-foreground">Start a conversation.</div>
            ) : (
              <div className="space-y-3">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}-${message.ts}`}
                    className={`max-w-3xl rounded border px-3 py-2 text-sm ${
                      message.role === "user"
                        ? "ml-auto border-border bg-background"
                        : "border-border bg-muted/30"
                    }`}
                  >
                    <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {message.role}
                    </div>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                ))}
                {sending && messages[messages.length - 1]?.role !== "assistant" ? (
                  <div className="max-w-3xl rounded border border-border bg-muted/30 px-3 py-2 text-sm">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      assistant
                    </div>
                    <div>Streaming…</div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <form
            onSubmit={(event) => void handleSend(event)}
            className="border-t border-border p-3"
          >
            <div className="grid gap-2 sm:grid-cols-[1fr_180px_180px_auto]">
              <label className="block">
                <span className="sr-only">Message</span>
                <textarea
                  aria-label="Message"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask anything"
                  className="min-h-24 w-full resize-y rounded border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={sending || loadingProvider || loadingSessions}
                />
              </label>

              <label className="block">
                <span className="sr-only">Provider</span>
                <select
                  aria-label="Provider"
                  value={providerId}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (!isAiProviderId(next)) {
                      return;
                    }
                    void applyProviderSelection(next);
                  }}
                  className="h-10 w-full rounded border border-border bg-background px-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={sending || loadingProvider}
                >
                  {PROVIDERS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="sr-only">Model</span>
                <select
                  aria-label="Model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="h-10 w-full rounded border border-border bg-background px-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={sending || loadingProvider}
                >
                  {(models.length > 0
                    ? models
                    : [{ id: model, name: model, contextWindow: 0 }]).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className="h-10 rounded border border-border px-4 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  sending || loadingProvider || loadingSessions || draft.trim().length === 0
                }
              >
                {sending ? "Sending" : "Send"}
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}

function buildSystemPrompt(systemPrompt: string, attachedNotes: AttachedNote[]): string {
  const parts: string[] = [];
  const trimmed = systemPrompt.trim();
  if (trimmed) {
    parts.push(trimmed);
  }
  if (attachedNotes.length > 0) {
    parts.push(
      attachedNotes
        .map(
          (note) =>
            `Attached note: ${note.title}\n\`\`\`\n${(note.body ?? "").trim()}\n\`\`\``,
        )
        .join("\n\n"),
    );
  }
  return parts.join("\n\n");
}

function approximateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}
