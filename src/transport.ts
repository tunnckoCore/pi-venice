import { randomBytes } from "node:crypto";

import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Context,
  type Model,
  type OpenAICompletionsCompat,
  type SimpleStreamOptions,
  type StopReason,
} from "@earendil-works/pi-ai";
import {
  convertMessages,
  streamSimpleOpenAICompletions,
} from "@earendil-works/pi-ai/openai-completions";

import { truncate } from "./helpers.ts";
import {
  normalizeAttestedPublicKeyHex,
  decryptVeniceE2EEChunk,
  encryptForVeniceE2EE,
  generateVeniceE2EEKeypair,
  isVeniceE2EEPayload,
} from "./e2ee.ts";
import { stripLeakedEncryptedReasoningFromAssistantContent } from "./reasoning.ts";

const VENICE_CHAT_API = "venice-chat";

const OPENAI_COMPAT: Required<OpenAICompletionsCompat> = {
  supportsStore: false,
  supportsDeveloperRole: false,
  supportsReasoningEffort: false,
  supportsUsageInStreaming: true,
  maxTokensField: "max_completion_tokens",
  requiresToolResultName: false,
  requiresAssistantAfterToolResult: false,
  requiresThinkingAsText: false,
  requiresReasoningContentOnAssistantMessages: false,
  thinkingFormat: "openai",
  openRouterRouting: {},
  vercelGatewayRouting: {},
  zaiToolStream: false,
  supportsStrictMode: true,
  cacheControlFormat: "anthropic",
  sendSessionAffinityHeaders: false,
  supportsLongCacheRetention: true,
};

interface AttestationResult {
  attestedPublicKeyHex: string;
}

// Bridges a custom-API model to openai-completions for delegation to the built-in
// stream handler. Model<any> is unavoidable here — Pi's Model type ties compat
// to the api type parameter, and we need to override both.
function asOpenAIModel(model: Model<any>): Model<"openai-completions"> {
  return {
    ...model,
    api: "openai-completions",
    compat: {
      ...OPENAI_COMPAT,
      ...(model.compat as OpenAICompletionsCompat | undefined),
    },
  };
}

function isE2EEModel(model: Model<any>): boolean {
  return (
    model.id.startsWith("e2ee-") || Boolean((model.compat as any)?.supportsE2EE)
  );
}

function hasToolHistory(context: Context): boolean {
  return context.messages.some(
    (message) =>
      message.role === "toolResult" ||
      (message.role === "assistant" &&
        message.content.some((block) => block.type === "toolCall")),
  );
}

function assertE2EESupportedContext(context: Context, model: Model<any>) {
  if (context.tools && context.tools.length > 0) {
    throw new Error(
      `Venice E2EE model ${model.id} does not support tool calling.`,
    );
  }
  if (hasToolHistory(context)) {
    throw new Error(
      `Venice E2EE model ${model.id} cannot continue a tool-call conversation.`,
    );
  }

  for (const message of context.messages) {
    if (message.role === "user" && Array.isArray(message.content)) {
      const hasImage = message.content.some((block) => block.type === "image");
      if (hasImage) {
        throw new Error(
          `Venice E2EE model ${model.id} does not support image inputs.`,
        );
      }
    }
  }
}

function parseResponseError(response: Response): Promise<string> {
  return response.text().catch(() => response.statusText || "Unknown error");
}

function veniceUrl(model: Model<any>, path: string): string {
  return `${model.baseUrl.replace(/\/+$/, "")}${path}`;
}

async function fetchAttestation(
  model: Model<any>,
  apiKey: string,
  signal?: AbortSignal,
): Promise<AttestationResult> {
  const nonce = randomBytes(32).toString("hex");
  const url = new URL(veniceUrl(model, "/tee/attestation"));
  url.searchParams.set("model", model.id);
  url.searchParams.set("nonce", nonce);

  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Venice attestation ${response.status}: ${truncate(await parseResponseError(response), 300)}`,
    );
  }

  const attestation = await response.json();
  if (attestation?.verified !== true) {
    throw new Error("Venice E2EE attestation was not verified.");
  }
  if (attestation?.nonce !== nonce) {
    throw new Error("Venice E2EE attestation nonce mismatch.");
  }

  const publicKey = attestation?.signing_key ?? attestation?.signing_public_key;
  if (typeof publicKey !== "string") {
    throw new Error(
      "Venice E2EE attestation did not include an enclave public key.",
    );
  }

  return { attestedPublicKeyHex: normalizeAttestedPublicKeyHex(publicKey) };
}

function textFromContent(content: unknown, role: string): string {
  if (typeof content === "string") return content;
  if (
    Array.isArray(content) &&
    content.every((part) => part?.type === "text")
  ) {
    return content.map((part) => part.text).join("");
  }
  throw new Error(`Venice E2EE only supports text ${role} message content.`);
}

// Only user and system messages are encrypted. Assistant messages are sent as
// plaintext per the Venice E2EE protocol — E2EE encrypts prompts, not responses.
function encryptMessagesForE2EE(
  messages: any[],
  clientSessionPrivateKey: Uint8Array,
  attestedPublicKeyHex: string,
): any[] {
  return messages.map((message) => {
    if (message.role !== "user" && message.role !== "system") return message;
    return {
      ...message,
      content: encryptForVeniceE2EE(
        textFromContent(message.content, message.role),
        clientSessionPrivateKey,
        attestedPublicKeyHex,
      ),
    };
  });
}

function buildE2EEPayload(
  model: Model<any>,
  context: Context,
  options?: SimpleStreamOptions,
): any {
  const openAIModel = asOpenAIModel(model);
  const compat = {
    ...OPENAI_COMPAT,
    ...(openAIModel.compat as OpenAICompletionsCompat | undefined),
  };
  const payload: any = {
    model: model.id,
    messages: convertMessages(openAIModel, context, compat),
    stream: true,
    stream_options: { include_usage: true },
  };

  if (options?.maxTokens) payload.max_completion_tokens = options.maxTokens;
  if (options?.temperature !== undefined)
    payload.temperature = options.temperature;
  if (options?.reasoning && model.reasoning && compat.supportsReasoningEffort) {
    payload.reasoning_effort = options.reasoning;
  }

  return stripLeakedEncryptedReasoningFromAssistantContent(payload);
}

function mapFinishReason(value: string | null | undefined): StopReason {
  if (value === "length") return "length";
  if (value === "tool_calls") return "toolUse";
  return "stop";
}

function decodeVeniceDelta(
  value: unknown,
  clientSessionPrivateKey: Uint8Array,
): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return isVeniceE2EEPayload(value)
    ? decryptVeniceE2EEChunk(value, clientSessionPrivateKey)
    : value;
}

function applyUsage(output: AssistantMessage, usage: any) {
  if (!usage || typeof usage !== "object") return;
  const input = Number(usage.prompt_tokens ?? 0);
  const completion = Number(usage.completion_tokens ?? 0);
  output.usage.input = input;
  output.usage.output = completion;
  output.usage.totalTokens = Number(usage.total_tokens ?? input + completion);
}

function endCurrentContentBlock(
  stream: ReturnType<typeof createAssistantMessageEventStream>,
  output: AssistantMessage,
) {
  const block = output.content[output.content.length - 1];
  if (!block) return;
  if (block.type === "text") {
    stream.push({
      type: "text_end",
      contentIndex: output.content.length - 1,
      content: block.text,
      partial: output,
    });
    return;
  }
  if (block.type === "thinking") {
    stream.push({
      type: "thinking_end",
      contentIndex: output.content.length - 1,
      content: block.thinking,
      partial: output,
    });
  }
}

function pushTextDelta(
  stream: ReturnType<typeof createAssistantMessageEventStream>,
  output: AssistantMessage,
  delta: string,
) {
  let block = output.content[output.content.length - 1];
  if (!block || block.type !== "text") {
    endCurrentContentBlock(stream, output);
    block = { type: "text", text: "" };
    output.content.push(block);
    stream.push({
      type: "text_start",
      contentIndex: output.content.length - 1,
      partial: output,
    });
  }
  block.text += delta;
  stream.push({
    type: "text_delta",
    contentIndex: output.content.length - 1,
    delta,
    partial: output,
  });
}

function pushThinkingDelta(
  stream: ReturnType<typeof createAssistantMessageEventStream>,
  output: AssistantMessage,
  delta: string,
  signature: string,
) {
  let block = output.content[output.content.length - 1];
  if (!block || block.type !== "thinking") {
    endCurrentContentBlock(stream, output);
    block = { type: "thinking", thinking: "", thinkingSignature: signature };
    output.content.push(block);
    stream.push({
      type: "thinking_start",
      contentIndex: output.content.length - 1,
      partial: output,
    });
  }
  block.thinking += delta;
  if (!block.thinkingSignature) block.thinkingSignature = signature;
  stream.push({
    type: "thinking_delta",
    contentIndex: output.content.length - 1,
    delta,
    partial: output,
  });
}

async function streamSSE(
  response: Response,
  onData: (data: string) => void,
): Promise<void> {
  if (!response.body)
    throw new Error("Venice E2EE response did not include a body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  const flushEvent = (chunk: string) => {
    const dataLines: string[] = [];
    for (const line of chunk.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length > 0) onData(dataLines.join("\n"));
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const events = buffered.split(/\r?\n\r?\n/);
    buffered = events.pop() ?? "";
    for (const event of events) flushEvent(event);
  }

  buffered += decoder.decode();
  const tail = buffered.trim();
  if (tail.length > 0) flushEvent(tail);
}

function streamVeniceE2EE(
  model: Model<any>,
  context: Context,
  options?: SimpleStreamOptions,
) {
  const stream = createAssistantMessageEventStream();
  const output: AssistantMessage = {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };

  (async () => {
    try {
      assertE2EESupportedContext(context, model);
      const apiKey = options?.apiKey;
      if (!apiKey) throw new Error("No Venice API key found for E2EE request.");

      const attestation = await fetchAttestation(
        model,
        apiKey,
        options?.signal,
      );
      const clientSession = generateVeniceE2EEKeypair();
      let payload = buildE2EEPayload(model, context, options);
      const nextPayload = await options?.onPayload?.(payload, model);
      if (nextPayload !== undefined) payload = nextPayload;

      payload.stream = true;
      payload.messages = encryptMessagesForE2EE(
        payload.messages,
        clientSession.privateKey,
        attestation.attestedPublicKeyHex,
      );

      const response = await fetch(veniceUrl(model, "/chat/completions"), {
        method: "POST",
        headers: {
          ...options?.headers,
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "X-Venice-TEE-Client-Pub-Key": clientSession.publicKeyHex,
          "X-Venice-TEE-Model-Pub-Key": attestation.attestedPublicKeyHex,
          "X-Venice-TEE-Signing-Algo": "ecdsa",
        },
        body: JSON.stringify(payload),
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Venice E2EE ${response.status}: ${truncate(await parseResponseError(response), 300)}`,
        );
      }

      stream.push({ type: "start", partial: output });
      await streamSSE(response, (data) => {
        if (!data || data === "[DONE]") return;
        const chunk = JSON.parse(data);
        output.responseId ||= chunk.id;
        if (chunk.usage) applyUsage(output, chunk.usage);
        const choice = Array.isArray(chunk.choices)
          ? chunk.choices[0]
          : undefined;
        if (!choice) return;
        if (choice.finish_reason)
          output.stopReason = mapFinishReason(choice.finish_reason);
        const content = decodeVeniceDelta(
          choice.delta?.content,
          clientSession.privateKey,
        );
        if (content) {
          pushTextDelta(stream, output, content);
        }
        const reasoningFields = [
          "reasoning_content",
          "reasoning",
          "reasoning_text",
        ];
        for (const field of reasoningFields) {
          const reasoningDelta = decodeVeniceDelta(
            choice.delta?.[field],
            clientSession.privateKey,
          );
          if (!reasoningDelta) continue;
          pushThinkingDelta(stream, output, reasoningDelta, field);
          break;
        }
      });

      if (options?.signal?.aborted) throw new Error("Request was aborted");
      endCurrentContentBlock(stream, output);
      stream.push({
        type: "done",
        reason: output.stopReason === "length" ? "length" : "stop",
        message: output,
      });
      stream.end();
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage =
        error instanceof Error ? error.message : String(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  })();

  return stream;
}

export function streamVenice(
  model: Model<any>,
  context: Context,
  options?: SimpleStreamOptions,
) {
  if (isE2EEModel(model)) return streamVeniceE2EE(model, context, options);

  return streamSimpleOpenAICompletions(asOpenAIModel(model), context, {
    ...options,
    onPayload: async (payload, payloadModel) => {
      const stripped =
        stripLeakedEncryptedReasoningFromAssistantContent(payload);
      const nextPayload = await options?.onPayload?.(stripped, payloadModel);
      return nextPayload === undefined ? stripped : nextPayload;
    },
  });
}

export { VENICE_CHAT_API };
