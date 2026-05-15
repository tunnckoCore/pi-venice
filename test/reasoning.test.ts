import { expect, test } from "bun:test";
import { stripLeakedEncryptedReasoningFromAssistantContent } from "../src/reasoning.ts";

test("reasoning strips encrypted marker lines from assistant string content", () => {
  const payload = {
    messages: [
      { role: "user", content: "Hello" },
      {
        role: "assistant",
        content:
          "Here is my answer.\n__ENCRYPTED_REASONING__abc123def456\nMore text.",
      },
    ],
  };

  const result = stripLeakedEncryptedReasoningFromAssistantContent(payload);
  const assistant = (result as any).messages[1];

  expect(assistant.content).toBe("Here is my answer.\nMore text.");
});

test("reasoning strips multiple encrypted marker lines", () => {
  const payload = {
    messages: [
      {
        role: "assistant",
        content:
          "__ENCRYPTED_REASONING__aaa\nActual response\n__ENCRYPTED_REASONING__bbb",
      },
    ],
  };

  const result = stripLeakedEncryptedReasoningFromAssistantContent(payload);

  expect((result as any).messages[0].content).toBe("Actual response");
});

test("reasoning preserves surrounding whitespace when removing marker lines", () => {
  const payload = {
    messages: [
      {
        role: "assistant",
        content: "Line A\n__ENCRYPTED_REASONING__xyz\nLine B",
      },
    ],
  };

  const result = stripLeakedEncryptedReasoningFromAssistantContent(payload);

  expect((result as any).messages[0].content).toBe("Line A\nLine B");
});

test("reasoning strips encrypted marker lines from assistant text parts", () => {
  const payload = {
    messages: [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Answer.\n__ENCRYPTED_REASONING__abc" },
          { type: "text", text: "__ENCRYPTED_REASONING__def\nMore" },
        ],
      },
    ],
  };

  const result = stripLeakedEncryptedReasoningFromAssistantContent(payload);
  const parts = (result as any).messages[0].content;

  expect(parts[0].text).toBe("Answer.");
  expect(parts[1].text).toBe("More");
});

test("reasoning returns payload by identity when nothing changes", () => {
  const payload = {
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Normal response, no markers." },
    ],
  };

  const result = stripLeakedEncryptedReasoningFromAssistantContent(payload);

  expect(result).toBe(payload);
});

test("reasoning does not strip encrypted marker text from user messages", () => {
  const payload = {
    messages: [
      {
        role: "user",
        content: "Question __ENCRYPTED_REASONING__abc",
      },
    ],
  };

  const result = stripLeakedEncryptedReasoningFromAssistantContent(payload);

  expect((result as any).messages[0].content).toBe(
    "Question __ENCRYPTED_REASONING__abc",
  );
});

test("reasoning handles null and undefined payloads", () => {
  expect(stripLeakedEncryptedReasoningFromAssistantContent(null)).toBeNull();
  expect(
    stripLeakedEncryptedReasoningFromAssistantContent(undefined),
  ).toBeUndefined();
});

test("reasoning leaves assistant messages without content unchanged", () => {
  const payload = {
    messages: [{ role: "assistant" }],
  };

  const result = stripLeakedEncryptedReasoningFromAssistantContent(payload);

  expect(result).toBe(payload);
});

test("reasoning preserves non-text parts in assistant array content", () => {
  const payload = {
    messages: [
      {
        role: "assistant",
        content: [
          { type: "text", text: "__ENCRYPTED_REASONING__abc" },
          { type: "image", url: "https://example.com/img.png" },
        ],
      },
    ],
  };

  const result = stripLeakedEncryptedReasoningFromAssistantContent(payload);
  const parts = (result as any).messages[0].content;

  expect(parts[0].text).toBe("");
  expect(parts[1]).toEqual({
    type: "image",
    url: "https://example.com/img.png",
  });
});
