import type { AiProvider, FetchLike } from "./provider";
import {
  createAnthropicProvider,
  createDeepSeekProvider,
  createOpenAIProvider,
} from "./provider";
import {
  deleteProviderApiKey,
  listProviderApiKeys,
  loadProviderApiKey,
  saveProviderApiKey,
} from "./api";

export const PROVIDER_API_KEY_RECORD_PREFIX = "provider.apiKey";

export interface ProviderApiKeyStore {
  load(providerId: string): Promise<string | null>;
  save(providerId: string, apiKey: string): Promise<void>;
  delete(providerId: string): Promise<void>;
  list(): Promise<string[]>;
}

export type ProviderResolutionOptions = {
  fetch?: FetchLike;
  anthropic?: {
    baseUrl?: string;
    defaultModel?: string;
  };
  openai?: {
    baseUrl?: string;
    defaultModel?: string;
  };
  deepseek?: {
    baseUrl?: string;
    defaultModel?: string;
  };
};

export function createWailsProviderApiKeyStore(): ProviderApiKeyStore {
  return {
    load: loadProviderApiKey,
    save: saveProviderApiKey,
    delete: deleteProviderApiKey,
    list: listProviderApiKeys,
  };
}

export async function createProviderFromStoredKey(
  providerId: string,
  store: ProviderApiKeyStore,
  options: ProviderResolutionOptions = {},
): Promise<AiProvider | null> {
  const apiKey = await store.load(providerId);
  if (!apiKey) {
    return null;
  }

  const fetchImpl = options.fetch;
  switch (providerId) {
    case "anthropic":
      return createAnthropicProvider({
        apiKey,
        fetch: fetchImpl,
        ...options.anthropic,
      });
    case "openai":
      return createOpenAIProvider({
        apiKey,
        fetch: fetchImpl,
        ...options.openai,
      });
    case "deepseek":
      return createDeepSeekProvider({
        apiKey,
        fetch: fetchImpl,
        ...options.deepseek,
      });
    default:
      return null;
  }
}
