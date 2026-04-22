import { beforeEach, describe, expect, it, vi } from "vitest";

const loadProviderApiKey = vi.fn();
const saveProviderApiKey = vi.fn();
const deleteProviderApiKey = vi.fn();
const listProviderApiKeys = vi.fn();

vi.mock("./api", () => ({
  loadProviderApiKey: (...args: unknown[]) => loadProviderApiKey(...args),
  saveProviderApiKey: (...args: unknown[]) => saveProviderApiKey(...args),
  deleteProviderApiKey: (...args: unknown[]) => deleteProviderApiKey(...args),
  listProviderApiKeys: (...args: unknown[]) => listProviderApiKeys(...args),
}));

import {
  createProviderFromStoredKey,
  createWailsProviderApiKeyStore,
} from "./providerSecrets";

function makeSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream",
      },
    },
  );
}

async function collectText(
  stream: AsyncIterable<{ type: "text"; text: string }>,
): Promise<string> {
  let out = "";
  for await (const delta of stream) {
    out += delta.text;
  }
  return out;
}

describe("providerSecrets", () => {
  beforeEach(() => {
    loadProviderApiKey.mockReset();
    saveProviderApiKey.mockReset();
    deleteProviderApiKey.mockReset();
    listProviderApiKeys.mockReset();
  });

  it("bridges load/save/delete/list calls through the Wails app", async () => {
    loadProviderApiKey.mockResolvedValue("anthropic-key");
    listProviderApiKeys.mockResolvedValue(["anthropic", "openai"]);

    const store = createWailsProviderApiKeyStore();

    await store.save("anthropic", "anthropic-key");
    expect(saveProviderApiKey).toHaveBeenCalledWith("anthropic", "anthropic-key");

    expect(await store.load("anthropic")).toBe("anthropic-key");
    expect(loadProviderApiKey).toHaveBeenCalledWith("anthropic");

    await store.delete("anthropic");
    expect(deleteProviderApiKey).toHaveBeenCalledWith("anthropic");

    expect(await store.list()).toEqual(["anthropic", "openai"]);
    expect(listProviderApiKeys).toHaveBeenCalledTimes(1);
  });

  it("creates a provider from a stored key and keeps the fetch seam mockable", async () => {
    const store = {
      load: vi.fn(async (providerId: string) =>
        providerId === "openai" ? "openai-key" : null,
      ),
      save: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.openai.test/v1/chat/completions");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer openai-key",
      });
      return makeSseResponse([
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        "data: [DONE]\n\n",
      ]);
    });

    const provider = await createProviderFromStoredKey("openai", store, {
      fetch: fetchMock,
      openai: {
        baseUrl: "https://api.openai.test",
      },
    });

    expect(provider?.id).toBe("openai");
    expect(provider?.defaultModel).toBe("gpt-4o-mini");

    if (!provider) {
      throw new Error("expected provider");
    }

    const text = await collectText(
      provider.chat([{ role: "user", content: "Hi" }], {
        model: "gpt-4o-mini",
      }),
    );

    expect(text).toBe("ok");
    expect(store.load).toHaveBeenCalledWith("openai");
  });

  it("returns null when no stored key exists", async () => {
    const store = {
      load: vi.fn(async () => null),
      save: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    };

    await expect(
      createProviderFromStoredKey("deepseek", store),
    ).resolves.toBeNull();
  });
});
