import { expect, test } from "bun:test";
import {
  AuthStorage,
  createAgentSessionFromServices,
  createAgentSessionServices,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import veniceExtension from "../src/index.ts";
import {
  decryptVeniceE2EEChunk,
  encryptForVeniceE2EE,
  generateVeniceE2EEKeypair,
} from "../src/e2ee.ts";

const VENICE_API_KEY = process.env.VENICE_API_KEY;

function requireVeniceApiKey(): string {
  if (!VENICE_API_KEY) {
    throw new Error(
      "VENICE_API_KEY is required for Venice extension integration tests",
    );
  }
  return VENICE_API_KEY;
}

const CWD = process.cwd();

type VeniceFixture = Awaited<ReturnType<typeof createVeniceFixture>>;

async function createVeniceFixture() {
  const authStorage = AuthStorage.inMemory({
    venice: {
      type: "api_key",
      key: requireVeniceApiKey(),
    },
  });

  const modelRegistry = ModelRegistry.inMemory(authStorage);
  const sessionManager = SessionManager.create(CWD);
  const services = await createAgentSessionServices({
    cwd: CWD,
    authStorage,
    modelRegistry,
    resourceLoaderOptions: {
      extensionFactories: [veniceExtension],
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
    },
  });
  const result = await createAgentSessionFromServices({
    services,
    sessionManager,
    tools: [],
  });
  await result.session.extensionRunner!.emit({
    type: "session_start",
    reason: "startup",
  });

  return { session: result.session, modelRegistry };
}

function findModel(fixture: VeniceFixture, id: string) {
  const model = fixture.modelRegistry.find("venice", id);
  if (!model) throw new Error(`Expected Venice model ${id} to be registered`);
  expect(model.provider).toBe("venice");
  return model;
}

async function runPromptWithModel(fixture: VeniceFixture, modelId: string) {
  const model = findModel(fixture, modelId);

  await fixture.session.setModel(model);

  let finalAssistant: any;
  const unsubscribe = fixture.session.subscribe((event) => {
    if (event.type === "message_end" && event.message.role === "assistant") {
      finalAssistant = event.message;
    }
  });

  try {
    await fixture.session.prompt("Reply with the single word: hello", {
      expandPromptTemplates: false,
      source: "extension",
    });
  } finally {
    unsubscribe();
  }

  expect(finalAssistant.role).toBe("assistant");
  expect(
    finalAssistant.content.length,
    "expects non-empty content with text hello",
  ).toBeGreaterThan(0);
  return finalAssistant;
}

function assertCompleted(message: any, modelId: string) {
  expect(message.provider).toBe("venice");
  expect(message.model).toBe(modelId);

  if (message.stopReason === "error") {
    throw new Error(
      message.errorMessage ?? "Venice extension returned an error",
    );
  }

  const text = message.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("");

  expect(text.length).toBeGreaterThan(2);
}

test("extension loads and registers qwen-3-6-plus and venice-uncensored-1-2", async () => {
  const fixture = await createVeniceFixture();

  const qwen = findModel(fixture, "qwen-3-6-plus");
  const uncensored = findModel(fixture, "venice-uncensored-1-2");

  expect(qwen.api).toBe("venice-chat");
  expect(
    (qwen.compat as { supportsE2EE?: boolean } | undefined)?.supportsE2EE,
  ).toBe(false);
  expect(uncensored.api).toBe("venice-chat");
  expect(
    (uncensored.compat as { supportsE2EE?: boolean } | undefined)?.supportsE2EE,
  ).toBe(false);
}, 20_000);

test("extension runs qwen-3-6-plus through the registered provider", async () => {
  const fixture = await createVeniceFixture();
  const message = await runPromptWithModel(fixture, "qwen-3-6-plus");

  assertCompleted(message, "qwen-3-6-plus");
}, 30_000);

test("extension runs venice-uncensored-1-2 through the registered provider", async () => {
  const fixture = await createVeniceFixture();
  const message = await runPromptWithModel(fixture, "venice-uncensored-1-2");

  assertCompleted(message, "venice-uncensored-1-2");
}, 30_000);

test("extension E2EE helper uses the caller-provided client session key", () => {
  const recipient = generateVeniceE2EEKeypair();
  const clientSession = generateVeniceE2EEKeypair();

  const first = encryptForVeniceE2EE(
    "first",
    clientSession.privateKey,
    recipient.publicKeyHex,
  );
  const second = encryptForVeniceE2EE(
    "second",
    clientSession.privateKey,
    recipient.publicKeyHex,
  );

  expect(first.slice(0, 130)).toBe(clientSession.publicKeyHex);
  expect(second.slice(0, 130)).toBe(clientSession.publicKeyHex);
  expect(decryptVeniceE2EEChunk(first, recipient.privateKey)).toBe("first");
  expect(decryptVeniceE2EEChunk(second, recipient.privateKey)).toBe("second");
});
