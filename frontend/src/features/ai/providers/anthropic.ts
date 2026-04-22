import type {
  AiMessage,
  AiModel,
  AiProvider,
  FetchLike,
} from "../provider";
import { streamTextDeltasFromSse } from "../provider";

type AnthropicProviderConfig = {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  fetch?: FetchLike;
};

type AnthropicModelListResponse = {
  data?: Array<{
    id?: string;
    display_name?: string;
    context_window?: number;
    contextWindow?: number;
  }>;
  models?: Array<{
    id?: string;
    display_name?: string;
    context_window?: number;
    contextWindow?: number;
  }>;
};

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_CONTEXT_WINDOW = 200000;
const ANTHROPIC_VERSION = "2023-06-01";

export function createAnthropicProvider(
  config: AnthropicProviderConfig,
): AiProvider {
  const baseUrl = normalizeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
  const apiKey = config.apiKey;
  const fetchImpl = config.fetch ?? fetch;
  const defaultModel = config.defaultModel ?? DEFAULT_MODEL;
  const knownContextWindows = new Map<string, number>([
    [defaultModel, DEFAULT_CONTEXT_WINDOW],
  ]);

  return {
    id: "anthropic",
    defaultModel,
    chat(messages, opts) {
      return chatAnthropic({
        fetchImpl,
        baseUrl,
        apiKey,
        messages,
        opts,
      });
    },
    async listModels() {
      const response = await fetchImpl(`${baseUrl}/v1/models`, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
      });
      if (!response.ok) {
        throw new Error(`Anthropic listModels failed with ${response.status}`);
      }
      const json = (await response.json()) as AnthropicModelListResponse;
      const items = json.data ?? json.models ?? [];
      return items.flatMap((item) => {
        const id = item.id ?? item.display_name;
        if (!id) {
          return [];
        }
        const contextWindow =
          item.context_window ?? item.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
        knownContextWindows.set(id, contextWindow);
        return [
          {
            id,
            name: item.display_name ?? id,
            contextWindow,
          } satisfies AiModel,
        ];
      });
    },
    contextWindow(model) {
      return knownContextWindows.get(model) ?? DEFAULT_CONTEXT_WINDOW;
    },
  };
}

function chatAnthropic(args: {
  fetchImpl: FetchLike;
  baseUrl: string;
  apiKey: string;
  messages: AiMessage[];
  opts: { model: string; system?: string };
}) {
  return (async function* () {
    const { fetchImpl, baseUrl, apiKey, messages, opts } = args;
    const payload = {
      model: opts.model,
      stream: true,
      ...(opts.system ? { system: opts.system } : {}),
      messages: messages.map((message) => ({
        role: message.role,
        content: [{ type: "text", text: message.content }],
      })),
    };

    const response = await fetchImpl(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Anthropic chat failed with ${response.status}`);
    }

    yield* streamTextDeltasFromSse(response, (event) => {
      try {
        const parsed = JSON.parse(event.data) as {
          delta?: { text?: string; text_delta?: string };
          content_block?: { text?: string };
        };
        return (
          parsed.delta?.text ??
          parsed.delta?.text_delta ??
          parsed.content_block?.text ??
          null
        );
      } catch {
        return null;
      }
    });
  })();
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
