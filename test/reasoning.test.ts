import { describe, expect, test } from "bun:test";
import { stripLeakedEncryptedReasoningFromAssistantContent } from "../src/reasoning.ts";

describe("reasoning", () => {
  describe("stripLeakedEncryptedReasoningFromAssistantContent", () => {
    test("strips __ENCRYPTED_REASONING__ from string content", () => {
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
      const result =
        stripLeakedEncryptedReasoningFromAssistantContent(payload);
      const assistant = (result as any).messages[1];
      expect(assistant.content).toBe("Here is my answer.\nMore text.");
    });

    test("strips multiple __ENCRYPTED_REASONING__ lines", () => {
      const payload = {
        messages: [
          {
            role: "assistant",
            content:
              "__ENCRYPTED_REASONING__aaa\nActual response\n__ENCRYPTED_REASONING__bbb",
          },
        ],
      };
      const result =
        stripLeakedEncryptedReasoningFromAssistantContent(payload);
      expect((result as any).messages[0].content).toBe("Actual response");
    });

    test("preserves surrounding whitespace when removing marker lines", () => {
      const payload = {
        messages: [
          {
            role: "assistant",
            content: "Line A\n__ENCRYPTED_REASONING__xyz\nLine B",
          },
        ],
      };
      const result =
        stripLeakedEncryptedReasoningFromAssistantContent(payload);
      expect((result as any).messages[0].content).toBe("Line A\nLine B");
    });

    test("strips __ENCRYPTED_REASONING__ from array-of-parts content", () => {
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
      const result =
        stripLeakedEncryptedReasoningFromAssistantContent(payload);
      const parts = (result as any).messages[0].content;
      expect(parts[0].text).toBe("Answer.");
      expect(parts[1].text).toBe("More");
    });

    test("returns payload by identity when nothing changes", () => {
      const payload = {
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Normal response, no markers." },
        ],
      };
      const result =
        stripLeakedEncryptedReasoningFromAssistantContent(payload);
      expect(result).toBe(payload);
    });

    test("does not strip from non-assistant messages", () => {
      const payload = {
        messages: [
          {
            role: "user",
            content: "Question __ENCRYPTED_REASONING__abc",
          },
        ],
      };
      const result =
        stripLeakedEncryptedReasoningFromAssistantContent(payload);
      expect((result as any).messages[0].content).toBe(
        "Question __ENCRYPTED_REASONING__abc",
      );
    });

    test("handles null/undefined payload", () => {
      expect(
        stripLeakedEncryptedReasoningFromAssistantContent(null),
      ).toBeNull();
      expect(
        stripLeakedEncryptedReasoningFromAssistantContent(undefined),
      ).toBeUndefined();
    });

    test("handles assistant message with no content", () => {
      const payload = {
        messages: [{ role: "assistant" }],
      };
      const result =
        stripLeakedEncryptedReasoningFromAssistantContent(payload);
      expect(result).toBe(payload);
    });

    test("preserves non-text parts in array content", () => {
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
      const result =
        stripLeakedEncryptedReasoningFromAssistantContent(payload);
      const parts = (result as any).messages[0].content;
      expect(parts[0].text).toBe("");
      expect(parts[1]).toEqual({
        type: "image",
        url: "https://example.com/img.png",
      });
    });
  });
});