import { createNote } from "@/features/vault/notes";

import {
  chatAppendSessionLine,
  chatDeleteSession,
  chatListSessionIds,
  chatReadSessionFile,
  chatReadSessionMeta,
  chatRenameSession,
  chatWriteSessionMeta,
} from "./api";
import type { AiProviderId } from "./provider";

export type ChatSessionRole = "user" | "assistant";

export type ChatSessionMessage = {
  role: ChatSessionRole;
  content: string;
  ts: number;
  provider: AiProviderId;
  model: string;
  attachments?: string[];
};

export type ChatSessionMetadata = {
  id: string;
  title: string;
  provider: AiProviderId;
  model: string;
  systemPrompt: string;
  summary: string;
  startedAt: number;
  updatedAt: number;
  messageCount: number;
};

export type ChatSession = {
  id: string;
  messages: ChatSessionMessage[];
  metadata: ChatSessionMetadata;
};

export type AppendChatSessionMessageArgs = {
  vaultRoot: string;
  sessionId: string;
  message: ChatSessionMessage;
};

export type LoadChatSessionArgs = {
  vaultRoot: string;
  sessionId: string;
};

export type ListChatSessionsArgs = {
  vaultRoot: string;
  limit?: number;
};

export type RebuildChatSessionMetaArgs = {
  vaultRoot: string;
  sessionId: string;
};

export type UpdateChatSessionMetadataArgs = {
  vaultRoot: string;
  sessionId: string;
  patch: Partial<Omit<ChatSessionMetadata, "id" | "startedAt" | "messageCount">>;
};

export type RenameChatSessionArgs = {
  vaultRoot: string;
  oldSessionId: string;
  newSessionId: string;
};

export type DeleteChatSessionArgs = {
  vaultRoot: string;
  sessionId: string;
};

export type ExtractSessionMessagesToNoteArgs = {
  vaultRoot: string;
  notePath: string;
  session: ChatSessionMetadata;
  messages: ChatSessionMessage[];
};

export function createChatSessionId(
  timestampMs: number = Date.now(),
  shortId: () => string = defaultShortId,
): string {
  const date = new Date(timestampMs);
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-") + `-${formatClock(date)}-${shortId()}`;
}

export function chatSessionFilePath(vaultRoot: string, sessionId: string): string {
  return `${trimTrailingSlash(vaultRoot)}/.chats/${sessionId}.jsonl`;
}

export function chatSessionMetaPath(vaultRoot: string, sessionId: string): string {
  return `${trimTrailingSlash(vaultRoot)}/.chats/${sessionId}.meta.json`;
}

export async function appendChatSessionMessage(
  args: AppendChatSessionMessageArgs,
): Promise<void> {
  const line = JSON.stringify(args.message);
  await chatAppendSessionLine(args.vaultRoot, args.sessionId, line);

  const raw = await chatReadSessionMeta(args.vaultRoot, args.sessionId);
  const existing = raw ? parseChatSessionMetadata(raw) : null;
  if (!existing) {
    await rebuildChatSessionMeta({
      vaultRoot: args.vaultRoot,
      sessionId: args.sessionId,
    });
    return;
  }

  const next: ChatSessionMetadata = {
    ...existing,
    messageCount: existing.messageCount + 1,
    updatedAt: args.message.ts || existing.updatedAt,
  };
  const trimmedTitle = existing.title.trim();
  if (!trimmedTitle || trimmedTitle === "Untitled chat") {
    if (args.message.role === "user") {
      const content = args.message.content.trim();
      if (content) next.title = content;
    }
  }
  await writeChatSessionMeta(args.vaultRoot, args.sessionId, next);
}

export async function loadChatSession(
  args: LoadChatSessionArgs,
): Promise<ChatSession> {
  const raw = await chatReadSessionFile(args.vaultRoot, args.sessionId);
  const messages = parseChatSessionMessages(raw);
  const metadata = await loadOrRebuildChatSessionMeta({
    vaultRoot: args.vaultRoot,
    sessionId: args.sessionId,
    messages,
  });

  return {
    id: args.sessionId,
    messages,
    metadata,
  };
}

export async function listChatSessions(
  args: ListChatSessionsArgs,
): Promise<ChatSessionMetadata[]> {
  const sessionIds = await chatListSessionIds(args.vaultRoot);
  const sessions = await Promise.all(
    sessionIds.map(async (sessionId) => {
      const rawMeta = await chatReadSessionMeta(args.vaultRoot, sessionId);
      if (rawMeta) {
        const metadata = parseChatSessionMetadata(rawMeta);
        if (metadata) {
          return metadata;
        }
      }
      return rebuildChatSessionMeta({
        vaultRoot: args.vaultRoot,
        sessionId,
      });
    }),
  );

  sessions.sort((a, b) => b.id.localeCompare(a.id));

  return sessions.slice(0, args.limit ?? 50);
}

export async function rebuildChatSessionMeta(
  args: RebuildChatSessionMetaArgs,
): Promise<ChatSessionMetadata> {
  const raw = await chatReadSessionFile(args.vaultRoot, args.sessionId);
  const messages = parseChatSessionMessages(raw);
  const metadata = deriveChatSessionMetadata(args.sessionId, messages);
  await writeChatSessionMeta(args.vaultRoot, args.sessionId, metadata);
  return metadata;
}

export async function updateChatSessionMetadata(
  args: UpdateChatSessionMetadataArgs,
): Promise<ChatSessionMetadata> {
  const raw = await chatReadSessionMeta(args.vaultRoot, args.sessionId);
  let metadata = raw ? parseChatSessionMetadata(raw) : null;
  if (!metadata) {
    metadata = await rebuildChatSessionMeta({
      vaultRoot: args.vaultRoot,
      sessionId: args.sessionId,
    });
  }

  const next: ChatSessionMetadata = {
    ...metadata,
    ...args.patch,
    updatedAt: args.patch.updatedAt ?? Date.now(),
  };
  await writeChatSessionMeta(args.vaultRoot, args.sessionId, next);
  return next;
}

export async function renameChatSession(
  args: RenameChatSessionArgs,
): Promise<ChatSessionMetadata> {
  await chatRenameSession(args.vaultRoot, args.oldSessionId, args.newSessionId);
  const session = await loadChatSession({
    vaultRoot: args.vaultRoot,
    sessionId: args.newSessionId,
  });
  return {
    ...session.metadata,
    id: args.newSessionId,
  };
}

export async function deleteChatSession(
  args: DeleteChatSessionArgs,
): Promise<void> {
  await chatDeleteSession(args.vaultRoot, args.sessionId);
}

export function buildSessionExtractNoteBody(args: {
  session: ChatSessionMetadata;
  messages: ChatSessionMessage[];
}): string {
  const transcript = args.messages.map(formatTranscriptLine).join("\n\n");
  return [
    "---",
    `source_session: .chats/${args.session.id}.jsonl`,
    "---",
    "",
    `# ${args.session.title}`,
    "",
    transcript,
    "",
  ].join("\n");
}

export async function extractSessionMessagesToNote(
  args: ExtractSessionMessagesToNoteArgs,
): Promise<void> {
  const body = buildSessionExtractNoteBody({
    session: args.session,
    messages: args.messages,
  });
  await createNote(args.vaultRoot, args.notePath, body);
}

async function loadOrRebuildChatSessionMeta(args: {
  vaultRoot: string;
  sessionId: string;
  messages: ChatSessionMessage[];
}): Promise<ChatSessionMetadata> {
  const raw = await chatReadSessionMeta(args.vaultRoot, args.sessionId);
  const parsed = raw ? parseChatSessionMetadata(raw) : null;
  if (parsed) {
    return parsed;
  }

  const metadata = deriveChatSessionMetadata(args.sessionId, args.messages);
  await writeChatSessionMeta(args.vaultRoot, args.sessionId, metadata);
  return metadata;
}

async function writeChatSessionMeta(
  vaultRoot: string,
  sessionId: string,
  metadata: ChatSessionMetadata,
): Promise<void> {
  await chatWriteSessionMeta(
    vaultRoot,
    sessionId,
    JSON.stringify(serializeChatSessionMetadata(metadata)),
  );
}

function parseChatSessionMetadata(raw: string): ChatSessionMetadata | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SerializedChatSessionMetadata>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.title !== "string" ||
      !isAiProviderId(parsed.provider) ||
      typeof parsed.model !== "string" ||
      typeof parsed.started_at !== "number" ||
      typeof parsed.updated_at !== "number" ||
      typeof parsed.message_count !== "number"
    ) {
      return null;
    }
    return {
      id: parsed.id,
      title: parsed.title,
      provider: parsed.provider,
      model: parsed.model,
      systemPrompt:
        typeof parsed.systemPrompt === "string" ? parsed.systemPrompt : "",
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      startedAt: parsed.started_at,
      updatedAt: parsed.updated_at,
      messageCount: parsed.message_count,
    };
  } catch {
    return null;
  }
}

function deriveChatSessionMetadata(
  sessionId: string,
  messages: ChatSessionMessage[],
): ChatSessionMetadata {
  const first = messages[0] ?? null;
  const firstUser = messages.find((message) => message.role === "user") ?? first;
  const title =
    firstUser?.content.trim() || first?.content.trim() || "Untitled chat";
  const provider = first?.provider ?? "openai";
  const model = first?.model ?? "gpt-4o-mini";
  const startedAt = first?.ts ?? Date.now();
  const updatedAt = messages[messages.length - 1]?.ts ?? startedAt;
  return {
    id: sessionId,
    title,
    provider,
    model,
    systemPrompt: "",
    summary: "",
    startedAt,
    updatedAt,
    messageCount: messages.length,
  };
}

function parseChatSessionMessages(raw: string): ChatSessionMessage[] {
  const messages: ChatSessionMessage[] = [];
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const line of lines) {
    if (line.trim() === "") continue;
    const message = parseChatSessionMessage(line);
    if (message) {
      messages.push(message);
      continue;
    }
    if (messages.length > 0) {
      break;
    }
  }
  return messages;
}

function parseChatSessionMessage(line: string): ChatSessionMessage | null {
  try {
    const parsed = JSON.parse(line) as Partial<ChatSessionMessage>;
    if (parsed.role !== "user" && parsed.role !== "assistant") return null;
    if (typeof parsed.content !== "string") return null;
    if (typeof parsed.ts !== "number") return null;
    if (!isAiProviderId(parsed.provider)) return null;
    if (typeof parsed.model !== "string") return null;

    const message: ChatSessionMessage = {
      role: parsed.role,
      content: parsed.content,
      ts: parsed.ts,
      provider: parsed.provider,
      model: parsed.model,
    };
    if (Array.isArray(parsed.attachments)) {
      message.attachments = parsed.attachments.filter(
        (item): item is string => typeof item === "string",
      );
    }
    return message;
  } catch {
    return null;
  }
}

function formatTranscriptLine(message: ChatSessionMessage): string {
  return `### ${message.role}\n\n${message.content}`;
}

function formatClock(date: Date): string {
  return [
    date.getUTCHours().toString().padStart(2, "0"),
    date.getUTCMinutes().toString().padStart(2, "0"),
    date.getUTCSeconds().toString().padStart(2, "0"),
  ].join("");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function defaultShortId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }
  return Math.random().toString(36).slice(2, 10).padEnd(8, "0");
}

function isAiProviderId(value: unknown): value is AiProviderId {
  return value === "anthropic" || value === "openai" || value === "deepseek";
}

type SerializedChatSessionMetadata = {
  id: string;
  title: string;
  provider: AiProviderId;
  model: string;
  systemPrompt: string;
  summary: string;
  started_at: number;
  updated_at: number;
  message_count: number;
};

function serializeChatSessionMetadata(
  metadata: ChatSessionMetadata,
): SerializedChatSessionMetadata {
  return {
    id: metadata.id,
    title: metadata.title,
    provider: metadata.provider,
    model: metadata.model,
    systemPrompt: metadata.systemPrompt,
    summary: metadata.summary,
    started_at: metadata.startedAt,
    updated_at: metadata.updatedAt,
    message_count: metadata.messageCount,
  };
}
