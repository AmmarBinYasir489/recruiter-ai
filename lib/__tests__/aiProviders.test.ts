import { describe, expect, it } from "vitest";
import { AI_PROVIDER_OPTIONS, defaultModelFor, normalizeAiModel, normalizeAiProvider } from "@/lib/ai/providers";
import { parseStoredProviderKeys } from "@/lib/ai/config";

describe("AI provider configuration", () => {
  it("supports the five configured provider families", () => {
    expect(AI_PROVIDER_OPTIONS.map((item) => item.id)).toEqual(["gemini", "openai", "anthropic", "groq", "openrouter"]);
  });

  it("falls back safely for an unknown provider", () => {
    expect(normalizeAiProvider("unknown-provider")).toBe("gemini");
  });

  it("accepts custom OpenRouter model IDs and rejects unsafe values", () => {
    expect(normalizeAiModel("openrouter", "nousresearch/hermes-4-70b")).toBe("nousresearch/hermes-4-70b");
    expect(() => normalizeAiModel("openrouter", "model id with spaces")).toThrow("Invalid model ID");
  });

  it("uses a provider-specific default model", () => {
    expect(defaultModelFor("anthropic")).toBe("claude-haiku-4-5");
    expect(defaultModelFor("openai")).toBe("gpt-5.6-luna");
  });

  it("parses independent encrypted provider key slots", () => {
    expect(parseStoredProviderKeys('{"gemini":"enc:one","anthropic":"enc:two"}')).toEqual({ gemini: "enc:one", anthropic: "enc:two" });
    expect(parseStoredProviderKeys("not-json")).toEqual({});
  });
});
