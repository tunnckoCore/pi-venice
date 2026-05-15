import { describe, expect, test } from "bun:test";
import {
  AuthStorage,
  createAgentSessionFromServices,
  createAgentSessionServices,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";

import veniceExtension from "../src/index.ts";
import {
  decryptVeniceE2EEChunk,
  encryptForVeniceE2EE,
  generateVeniceE2EEKeypair,
} from "../src/e2ee.ts";

const VENICE_API_KEY = process.env.VENICE_API_KEY;
if (!VENICE_API_KEY) {
  throw new Error("VENICE_API_KEY is required for Venice extension tests");
}

const CWD = process.cwd();

type VeniceFixture = Awaited<ReturnType<typeof createVeniceFixture>>;

async function createVeniceFixture() {
  const authStorage = AuthStorage.inMemory({
    venice: { type: "api_key", key: VENICE_API_KEY! },
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
  expect(model).toBeDefined();
  return model!;
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

  expect(finalAssistant).toBeDefined();
  return finalAssistant;
}

function assertCompletionOrKnownBillingError(message: any, modelId: string) {
  expect(message.provider).toBe("venice");
  expect(message.model).toBe(modelId);

  if (message.stopReason === "error") {
    expect(message.errorMessage).toContain("Insufficient USD or Diem balance");
    return;
  }

  const text = message.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("");
  expect(text.length).toBeGreaterThan(0);
}

describe("Venice extension", () => {
  test("loads the extension and registers qwen-3-6-plus and venice-uncensored-1-2", async () => {
    const fixture = await createVeniceFixture();

    const qwen = findModel(fixture, "qwen-3-6-plus");
    const uncensored = findModel(fixture, "venice-uncensored-1-2");

    expect(qwen.api).toBe("venice-chat");
    expect(qwen.compat?.supportsE2EE).toBe(false);
    expect(uncensored.api).toBe("venice-chat");
    expect(uncensored.compat?.supportsE2EE).toBe(false);
  }, 20_000);

  test("runs qwen-3-6-plus through the extension-registered provider", async () => {
    const fixture = await createVeniceFixture();
    const message = await runPromptWithModel(fixture, "qwen-3-6-plus");
    assertCompletionOrKnownBillingError(message, "qwen-3-6-plus");
  }, 30_000);

  test("runs venice-uncensored-1-2 through the extension-registered provider", async () => {
    const fixture = await createVeniceFixture();
    const message = await runPromptWithModel(fixture, "venice-uncensored-1-2");
    assertCompletionOrKnownBillingError(message, "venice-uncensored-1-2");
  }, 30_000);

  test("encryptForVeniceE2EE uses the caller-provided client session key", () => {
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
});
