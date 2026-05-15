const ENCRYPTED_REASONING_TOKEN = "__ENCRYPTED_REASONING__";

function stripEncryptedReasoningLines(value: string): string {
  if (!value.includes(ENCRYPTED_REASONING_TOKEN)) return value;
  const lines = value.split("\n");
  const kept = lines.filter((line) => !line.includes(ENCRYPTED_REASONING_TOKEN));
  return kept.join("\n");
}

function stripAssistantContent(content: unknown): {
  content: unknown;
  changed: boolean;
} {
  if (typeof content === "string") {
    const next = stripEncryptedReasoningLines(content);
    return { content: next, changed: next !== content };
  }

  if (!Array.isArray(content)) return { content, changed: false };

  let changed = false;
  const next = content.map((part) => {
    if (
      !part ||
      typeof part !== "object" ||
      (part as { type?: unknown }).type !== "text" ||
      typeof (part as { text?: unknown }).text !== "string"
    ) {
      return part;
    }

    const text = (part as { text: string }).text;
    const stripped = stripEncryptedReasoningLines(text);
    if (stripped === text) return part;

    changed = true;
    return { ...part, text: stripped };
  });

  return { content: next, changed };
}

export function stripLeakedEncryptedReasoningFromAssistantContent(
  payload: unknown,
): unknown {
  if (!payload || typeof payload !== "object") return payload;

  const candidate = payload as { messages?: unknown };
  if (!Array.isArray(candidate.messages)) return payload;

  let changed = false;
  const messages = candidate.messages.map((message) => {
    if (
      !message ||
      typeof message !== "object" ||
      (message as { role?: unknown }).role !== "assistant" ||
      !("content" in message)
    ) {
      return message;
    }

    const { content, changed: contentChanged } = stripAssistantContent(
      (message as { content?: unknown }).content,
    );
    if (!contentChanged) return message;

    changed = true;
    return { ...message, content };
  });

  if (!changed) return payload;
  return { ...payload, messages };
}