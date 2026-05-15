import { expect, test } from "bun:test";
import { streamVenice, VENICE_CHAT_API } from "../src/transport.ts";
import type {
  Context,
  Model,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";

const VENICE_API_KEY = process.env.VENICE_API_KEY;

function requireVeniceApiKey(): string {
  if (!VENICE_API_KEY) {
    throw new Error(
      "VENICE_API_KEY is required for Venice transport integration tests",
    );
  }
  return VENICE_API_KEY;
}

const VENICE_BASE_URL = "https://api.venice.ai/api/v1";

function makeModel(
  id: string,
  overrides: Record<string, any> = {},
): Model<any> {
  return {
    id,
    name: id,
    provider: "venice",
    api: VENICE_CHAT_API,
    baseUrl: VENICE_BASE_URL,
    reasoning: overrides.reasoning ?? false,
    input: overrides.input ?? ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 4096,
    compat: overrides.compat ?? {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsE2EE:
        "supportsE2EE" in overrides
          ? Boolean(overrides.supportsE2EE)
          : id.startsWith("e2ee-"),
    },
  };
}

function makeContext(userContent: string, tools?: any[]): Context {
  return {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: userContent }],
        timestamp: Date.now(),
      },
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

test("transport marks e2ee- prefix models as E2EE", () => {
  const model = makeModel("e2ee-glm-5-1");

  expect((model.compat as any).supportsE2EE).toBe(true);
  expect(model.id.startsWith("e2ee-")).toBe(true);
});

test("transport reads supportsE2EE from model compat", () => {
  const model = makeModel("some-model", {
    supportsE2EE: true,
  });

  expect((model.compat as any).supportsE2EE).toBe(true);
});

test("transport marks non-E2EE models with supportsE2EE false", () => {
  const model = makeModel("qwen-3-6-plus");

  expect((model.compat as any).supportsE2EE).toBe(false);
});

test("transport rejects E2EE model with tools", async () => {
  const apiKey = requireVeniceApiKey();
  const model = makeModel("e2ee-glm-5-1");
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

  const stream = streamVenice(model, context, { apiKey });
  const { message } = await collectStream(stream);

  expect(message).toBeDefined();
  expect(message.stopReason).toBe("error");
  expect(message.errorMessage).toContain("does not support tool calling");
}, 10000);

test("transport rejects E2EE model with image input", async () => {
  const apiKey = requireVeniceApiKey();
  const model = makeModel("e2ee-glm-5-1");
  const context: Context = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "describe this" },
          {
            type: "image",
            data: "data:image/png;base64,abc",
            mimeType: "image/png",
          },
        ],
        timestamp: Date.now(),
      },
    ],
    tools: [],
  };

  const stream = streamVenice(model, context, { apiKey });
  const { message } = await collectStream(stream);

  expect(message).toBeDefined();
  expect(message.stopReason).toBe("error");
  expect(message.errorMessage).toContain("does not support image inputs");
}, 10000);

test("transport rejects E2EE model with tool history", async () => {
  const apiKey = requireVeniceApiKey();
  const model = makeModel("e2ee-glm-5-1", { supportsE2EE: true });
  const context: Context = {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "hello" }],
        timestamp: Date.now(),
      },
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call_1",
            name: "test_tool",
            arguments: {},
          },
        ],
        api: VENICE_CHAT_API,
        provider: "venice",
        model: "e2ee-glm-5-1",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "toolUse",
        timestamp: Date.now(),
      },
    ],
    tools: [],
  };

  const stream = streamVenice(model, context, { apiKey });
  const { message } = await collectStream(stream);

  expect(message).toBeDefined();
  expect(message.stopReason).toBe("error");
  expect(message.errorMessage).toContain(
    "cannot continue a tool-call conversation",
  );
}, 10000);

test("transport streams a response from anon model qwen-3-6-plus", async () => {
  const apiKey = requireVeniceApiKey();
  const model = makeModel("qwen-3-6-plus", { reasoning: true });
  const context = makeContext("Say exactly: hello world");

  const stream = streamVenice(model, context, { apiKey, maxTokens: 50 });
  const { message } = await collectStream(stream);

  if (message?.stopReason === "error") {
    throw new Error(
      message.errorMessage ?? "Venice transport returned an error",
    );
  }

  expect(message).toBeDefined();
  expect(message.role).toBe("assistant");
  expect(
    message.content.length,
    "expects non-empty content with response",
  ).toBeGreaterThan(0);

  const text = message.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");

  expect(text.toLowerCase()).toBe("hello world");
}, 30_000);

test("transport streams a response from private model venice-uncensored-1-2", async () => {
  const apiKey = requireVeniceApiKey();
  const model = makeModel("venice-uncensored-1-2");
  const context = makeContext("Say exactly: i am private model venice");

  const stream = streamVenice(model, context, { apiKey, maxTokens: 50 });
  const { message } = await collectStream(stream);

  if (message?.stopReason === "error") {
    throw new Error(
      message.errorMessage ?? "Venice transport returned an error",
    );
  }

  expect(message).toBeDefined();
  expect(message.role).toBe("assistant");

  const text = message.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");

  expect(text.length).toBeGreaterThan(0);
  expect(text.toLowerCase()).toBe("i am private model venice");
}, 30_000);
