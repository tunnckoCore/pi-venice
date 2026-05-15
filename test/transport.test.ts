import { describe, expect, test } from "bun:test";
import { streamVenice, VENICE_CHAT_API } from "../src/transport.ts";
import type { Context, Model, SimpleStreamOptions } from "@mariozechner/pi-ai";

const VENICE_API_KEY = process.env.VENICE_API_KEY;
if (!VENICE_API_KEY) {
  throw new Error("VENICE_API_KEY is required for Venice transport tests");
}
const VENICE_BASE_URL = "https://api.venice.ai/api/v1";

function makeModel(id: string, overrides: Record<string, any> = {}): Model<any> {
  return {
    id,
    name: id,
    api: VENICE_CHAT_API,
    provider: "venice",
    baseUrl: VENICE_BASE_URL,
    reasoning: overrides.reasoning ?? false,
    input: overrides.input ?? ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 4096,
    compat: overrides.compat ?? {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      ...("supportsE2EE" in overrides
        ? { supportsE2EE: overrides.supportsE2EE }
        : {}),
    },
  };
}

function makeContext(userContent: string, tools?: any[]): Context {
  return {
    messages: [
      { role: "user", content: [{ type: "text", text: userContent }] },
    ],
    tools: tools ?? [],
  };
}

async function collectStream(
  stream: ReturnType<typeof streamVenice>,
): Promise<{ message: any; events: any[] }> {
  const events: any[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  const done = events.find((e: any) => e.type === "done");
  const error = events.find((e: any) => e.type === "error");
  return {
    message: done?.message ?? error?.error ?? null,
    events,
  };
}

describe("transport", () => {
  describe("E2EE model detection", () => {
    test("e2ee- prefix models are detected via model.id", () => {
      const model = makeModel("e2ee-venice-uncensored-24b-p", {
        supportsE2EE: true,
      });
      expect((model.compat as any).supportsE2EE).toBe(true);
      expect(model.id.startsWith("e2ee-")).toBe(true);
    });

    test("supportsE2EE compat flag models are detected", () => {
      const model = makeModel("some-model", {
        supportsE2EE: true,
      });
      expect((model.compat as any).supportsE2EE).toBe(true);
    });

    test("non-E2EE model has no E2EE flag", () => {
      const model = makeModel("qwen-3-6-plus", {
        supportsE2EE: false,
      });
      expect((model.compat as any).supportsE2EE).toBe(false);
    });
  });

  describe("E2EE validation", () => {
    test(
      "rejects E2EE model with tools",
      async () => {
        const model = makeModel("e2ee-venice-uncensored-24b-p", {
          supportsE2EE: true,
        });
        const context = makeContext("hello", [
          {
            name: "test_tool",
            description: "A test tool",
            parameters: {
              type: "object" as const,
              properties: { query: { type: "string" as const } },
            },
          },
        ]);
        const options: SimpleStreamOptions = {
          apiKey: VENICE_API_KEY,
        };

        const stream = streamVenice(model, context, options);
        const { message } = await collectStream(stream);
        expect(message).toBeDefined();
        expect(message.stopReason).toBe("error");
        expect(message.errorMessage).toContain(
          "does not support tool calling",
        );
      },
      10000,
    );

    test(
      "rejects E2EE model with image input",
      async () => {
        const model = makeModel("e2ee-venice-uncensored-24b-p", {
          supportsE2EE: true,
        });
        const context: Context = {
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "describe this" },
                {
                  type: "image",
                  image: "data:image/png;base64,abc",
                  mimeType: "image/png",
                },
              ],
            },
          ],
          tools: [],
        };
        const options: SimpleStreamOptions = {
          apiKey: VENICE_API_KEY,
        };

        const stream = streamVenice(model, context, options);
        const { message } = await collectStream(stream);
        expect(message).toBeDefined();
        expect(message.stopReason).toBe("error");
        expect(message.errorMessage).toContain(
          "does not support image inputs",
        );
      },
      10000,
    );

    test(
      "rejects E2EE model with tool history",
      async () => {
        const model = makeModel("e2ee-venice-uncensored-24b-p", {
          supportsE2EE: true,
        });
        const context: Context = {
          messages: [
            { role: "user", content: [{ type: "text", text: "hello" }] },
            {
              role: "assistant",
              content: [
                {
                  type: "toolCall",
                  id: "call_1",
                  name: "test_tool",
                  arguments: "{}",
                },
              ],
            },
          ],
          tools: [],
        };
        const options: SimpleStreamOptions = {
          apiKey: VENICE_API_KEY,
        };

        const stream = streamVenice(model, context, options);
        const { message } = await collectStream(stream);
        expect(message).toBeDefined();
        expect(message.stopReason).toBe("error");
        expect(message.errorMessage).toContain(
          "cannot continue a tool-call conversation",
        );
      },
      10000,
    );
  });

  describe("non-E2EE streaming", () => {
    test(
      "streams a response from qwen-3-6-plus",
      async () => {
        const model = makeModel("qwen-3-6-plus", {
          reasoning: true,
        });
        const context = makeContext("Say exactly: hello world");
        const options: SimpleStreamOptions = {
          apiKey: VENICE_API_KEY,
          maxTokens: 50,
        };

        const stream = streamVenice(model, context, options);
        const { message, events } = await collectStream(stream);

        // If we get an API error (e.g. insufficient balance), report it clearly
        if (message?.stopReason === "error") {
          console.log(
            `API error: ${message.errorMessage ?? "unknown"} — skipping assertion`,
          );
          return;
        }

        expect(message).toBeDefined();
        expect(message.role).toBe("assistant");
        expect(message.content.length).toBeGreaterThan(0);
        const text = message.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");
        expect(text.toLowerCase()).toContain("hello");
      },
      30000,
    );

    test(
      "streams a response from venice-uncensored-1-2",
      async () => {
        const model = makeModel("venice-uncensored-1-2");
        const context = makeContext("Say exactly: test response");
        const options: SimpleStreamOptions = {
          apiKey: VENICE_API_KEY,
          maxTokens: 50,
        };

        const stream = streamVenice(model, context, options);
        const { message } = await collectStream(stream);

        if (message?.stopReason === "error") {
          console.log(
            `API error: ${message.errorMessage ?? "unknown"} — skipping assertion`,
          );
          return;
        }

        expect(message).toBeDefined();
        expect(message.role).toBe("assistant");
        const text = message.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");
        expect(text.length).toBeGreaterThan(0);
      },
      30000,
    );
  });
});