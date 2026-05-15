import { describe, expect, test } from "bun:test";
import { normalizeModel } from "../src/helpers.ts";

const VENICE_API_KEY = process.env.VENICE_API_KEY ?? "";
const VENICE_BASE_URL = "https://api.venice.ai/api/v1";

describe("helpers", () => {
  describe("normalizeModel", () => {
    test("maps supportsE2EE and supportsTeeAttestation from capabilities", () => {
      const raw = {
        id: "e2ee-test-model",
        type: "text",
        model_spec: {
          name: "Test E2EE",
          capabilities: {
            supportsE2EE: true,
            supportsTeeAttestation: true,
            supportsReasoning: false,
            supportsVision: false,
          },
        },
      };
      const model = normalizeModel(raw);
      expect(model.supportsE2EE).toBe(true);
      expect(model.supportsTeeAttestation).toBe(true);
      expect(model.supportsReasoning).toBe(false);
    });

    test("defaults E2EE flags to false when absent", () => {
      const raw = {
        id: "qwen-test",
        type: "text",
        model_spec: {
          name: "Qwen Test",
          capabilities: {
            supportsReasoning: true,
          },
        },
      };
      const model = normalizeModel(raw);
      expect(model.supportsE2EE).toBe(false);
      expect(model.supportsTeeAttestation).toBe(false);
      expect(model.supportsReasoning).toBe(true);
    });
  });
});

describe("venice API integration", () => {
  describe("model catalog", () => {
    test("fetches and normalizes models from Venice API", async () => {
      if (!VENICE_API_KEY) {
        console.log("Skipping: VENICE_API_KEY not set");
        return;
      }
      const res = await fetch(`${VENICE_BASE_URL}/models?type=all`, {
        headers: { Authorization: `Bearer ${VENICE_API_KEY}` },
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);

      const models = data.data.map(normalizeModel);
      const textModels = models.filter((m: any) => m.family === "text");
      expect(textModels.length).toBeGreaterThan(0);

      // qwen-3-6-plus should be a normal text model
      const qwen = textModels.find((m: any) => m.id === "qwen-3-6-plus");
      expect(qwen).toBeDefined();
      expect(qwen!.supportsReasoning).toBe(true);
      expect(qwen!.supportsE2EE).toBe(false);

      // E2EE model should have flag set
      const e2ee = textModels.find((m: any) =>
        m.id.startsWith("e2ee-"),
      );
      if (e2ee) {
        expect(e2ee.supportsE2EE).toBe(true);
        expect(e2ee.supportsVision).toBe(false);
      }
    }, 15000);
  });
});