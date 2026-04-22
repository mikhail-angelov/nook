import type { AiProvider } from "../provider";
import { createOpenAIProvider } from "./openai";

type DeepSeekProviderConfig = {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  fetch?: Parameters<typeof createOpenAIProvider>[0]["fetch"];
};

export function createDeepSeekProvider(
  config: DeepSeekProviderConfig,
): AiProvider {
  const provider = createOpenAIProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? "https://api.deepseek.com",
    defaultModel: config.defaultModel ?? "deepseek-chat",
    fetch: config.fetch,
  });

  return {
    ...provider,
    id: "deepseek",
    defaultModel: config.defaultModel ?? "deepseek-chat",
  };
}
