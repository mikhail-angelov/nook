import type {
  AiMessage,
  AiModel,
  AiProvider,
  FetchLike,
} from "../provider";
import { streamTextDeltasFromSse } from "../provider";

type OpenAIProviderConfig = {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  fetch?: FetchLike;
};

type OpenAIModelListResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    context_window?: number;
    contextWindow?: number;
  }>;
  models?: Array<{
    id?: string;
    name?: string;
    context_window?: number;
    contextWindow?: number;
  }>;
};

const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_CONTEXT_WINDOW = 128000;

export function createOpenAIProvider(
  config: OpenAIProviderConfig,
): AiProvider {
  const baseUrl = normalizeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
  const apiKey = config.apiKey;
  const fetchImpl = config.fetch ?? fetch;
  const defaultModel = config.defaultModel ?? DEFAULT_MODEL;
  const knownContextWindows = new Map<string, number>([
    [defaultModel, DEFAULT_CONTEXT_WINDOW],
  ]);

  return {
    id: "openai",
    defaultModel,
    chat(messages, opts) {
      return chatOpenAI({
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
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (!response.ok) {
        throw new Error(`OpenAI listModels failed with ${response.status}`);
      }
      const json = (await response.json()) as OpenAIModelListResponse;
      const items = json.data ?? json.models ?? [];
      return items.flatMap((item) => {
        const id = item.id ?? item.name;
        if (!id) {
          return [];
        }
        const contextWindow =
          item.context_window ?? item.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
        knownContextWindows.set(id, contextWindow);
        return [
          {
            id,
            name: item.name ?? id,
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

function chatOpenAI(args: {
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
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        ...messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
    };

    const response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`OpenAI chat failed with ${response.status}`);
    }

    yield* streamTextDeltasFromSse(response, (event) => {
      if (event.data === "[DONE]") {
        return null;
      }
      try {
        const parsed = JSON.parse(event.data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        return parsed.choices?.[0]?.delta?.content ?? null;
      } catch {
        return null;
      }
    });
  })();
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
