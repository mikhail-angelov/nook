export type AiProviderId = "anthropic" | "openai" | "deepseek";
export type AiRole = "user" | "assistant" | "system";

export type AiMessage = {
  role: Exclude<AiRole, "system">;
  content: string;
};

export type AiDelta = {
  type: "text";
  text: string;
};

export type AiModel = {
  id: string;
  name: string;
  contextWindow: number;
};

export type AiChatOptions = {
  model: string;
  system?: string;
  stream?: boolean;
};

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type SseEvent = {
  event: string | null;
  data: string;
  id: string | null;
};

export interface AiProvider {
  id: AiProviderId;
  defaultModel: string;
  chat(messages: AiMessage[], opts: AiChatOptions): AsyncIterable<AiDelta>;
  listModels(): Promise<AiModel[]>;
  contextWindow(model: string): number;
}

export async function* readSseEvents(
  response: Response,
): AsyncIterable<SseEvent> {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName: string | null = null;
  let eventId: string | null = null;
  let dataLines: string[] = [];

  const emit = (): SseEvent | null => {
    if (eventName === null && eventId === null && dataLines.length === 0) {
      return null;
    }
    const event = {
      event: eventName,
      data: dataLines.join("\n"),
      id: eventId,
    };
    eventName = null;
    eventId = null;
    dataLines = [];
    return event;
  };

  const processLine = (line: string): SseEvent | null => {
    if (line === "") {
      return emit();
    }
    if (line.startsWith(":")) {
      return null;
    }

    const colon = line.indexOf(":");
    const field = colon >= 0 ? line.slice(0, colon) : line;
    let value = colon >= 0 ? line.slice(colon + 1) : "";
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    switch (field) {
      case "event":
        eventName = value || null;
        break;
      case "data":
        dataLines.push(value);
        break;
      case "id":
        eventId = value || null;
        break;
      default:
        break;
    }
    return null;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

      let lineBreak = buffer.indexOf("\n");
      while (lineBreak >= 0) {
        const line = buffer.slice(0, lineBreak);
        buffer = buffer.slice(lineBreak + 1);
        const event = processLine(line);
        if (event) {
          yield event;
        }
        lineBreak = buffer.indexOf("\n");
      }
    }

    if (buffer.length > 0) {
      const event = processLine(buffer);
      if (event) {
        yield event;
      }
    }

    const finalEvent = emit();
    if (finalEvent) {
      yield finalEvent;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* streamTextDeltasFromSse(
  response: Response,
  extract: (event: SseEvent) => string | null,
): AsyncIterable<AiDelta> {
  for await (const event of readSseEvents(response)) {
    const text = extract(event);
    if (!text) {
      continue;
    }
    yield { type: "text", text };
  }
}

export { createAnthropicProvider } from "./providers/anthropic";
export { createDeepSeekProvider } from "./providers/deepseek";
export { createOpenAIProvider } from "./providers/openai";
