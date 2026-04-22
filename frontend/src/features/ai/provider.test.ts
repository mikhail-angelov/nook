import { describe, expect, it, vi } from "vitest";

import {
  createAnthropicProvider,
  createDeepSeekProvider,
  createOpenAIProvider,
  readSseEvents,
} from "./provider";

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

async function collectText(stream: AsyncIterable<{ type: "text"; text: string }>): Promise<string> {
  let out = "";
  for await (const delta of stream) {
    out += delta.text;
  }
  return out;
}

describe("readSseEvents", () => {
  it("parses chunked SSE events and preserves event names", async () => {
    const response = makeSseResponse([
      "event: message\n",
      "data: hel",
      "lo\n\n",
      ": comment\n",
      "event: other\n",
      "data: world\n",
      "\n",
    ]);

    const events: Array<{ event: string | null; data: string }> = [];
    for await (const event of readSseEvents(response)) {
      events.push({ event: event.event, data: event.data });
    }

    expect(events).toEqual([
      { event: "message", data: "hello" },
      { event: "other", data: "world" },
    ]);
  });
});

describe("AI providers", () => {
  it("streams anthropic deltas and sends the expected request", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(_input)).toBe("https://api.anthropic.com/v1/messages");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "x-api-key": "anthropic-key",
        "anthropic-version": "2023-06-01",
      });

      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "claude-sonnet-4-6",
        system: "You are terse.",
        stream: true,
        messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      });

      return makeSseResponse([
        'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Hel"}}\n\n',
        'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"lo"}}\n\n',
        "event: message_stop\ndata: {}\n\n",
      ]);
    });

    const provider = createAnthropicProvider({
      apiKey: "anthropic-key",
      fetch: fetchMock,
    });

    const text = await collectText(
      provider.chat([{ role: "user", content: "Hi" }], {
        model: "claude-sonnet-4-6",
        system: "You are terse.",
      }),
    );

    expect(text).toBe("Hello");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(provider.id).toBe("anthropic");
    expect(provider.defaultModel).toBe("claude-sonnet-4-6");
  });

  it("streams openai-compatible deltas and lists models", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/v1/models")) {
        expect(init?.method ?? "GET").toBe("GET");
        return Response.json({
          data: [
            { id: "gpt-4o-mini" },
            { id: "gpt-4.1" },
          ],
        });
      }

      expect(String(input)).toBe("https://api.openai.test/v1/chat/completions");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer openai-key",
      });

      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "gpt-4o-mini",
        stream: true,
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Hi" },
        ],
      });

      return makeSseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        "data: [DONE]\n\n",
      ]);
    });

    const provider = createOpenAIProvider({
      apiKey: "openai-key",
      baseUrl: "https://api.openai.test",
      fetch: fetchMock,
    });

    const models = await provider.listModels();
    expect(models).toEqual([
      { id: "gpt-4o-mini", name: "gpt-4o-mini", contextWindow: 128000 },
      { id: "gpt-4.1", name: "gpt-4.1", contextWindow: 128000 },
    ]);

    const text = await collectText(
      provider.chat([{ role: "user", content: "Hi" }], {
        model: "gpt-4o-mini",
        system: "You are helpful.",
      }),
    );

    expect(text).toBe("Hello");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(provider.id).toBe("openai");
    expect(provider.defaultModel).toBe("gpt-4o-mini");
  });

  it("uses the deepseek base url and default model metadata", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      makeSseResponse([
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );

    const provider = createDeepSeekProvider({
      apiKey: "deepseek-key",
      fetch: fetchMock,
    });

    expect(provider.id).toBe("deepseek");
    expect(provider.defaultModel).toBe("deepseek-chat");

    const text = await collectText(
      provider.chat([{ role: "user", content: "Hi" }], {
        model: "deepseek-chat",
      }),
    );

    expect(text).toBe("ok");
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
  });
});
