import { describe, expect, it } from "vitest";
import { AI_PROVIDER_OPTIONS, defaultModelFor, normalizeAiModel, normalizeAiProvider } from "@/lib/ai/providers";
import { aiProviderStates, decryptAiKey, encryptAiKey, parseStoredProviderChecks, parseStoredProviderKeys } from "@/lib/ai/config";

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

  it("distinguishes configured, working, failed, and unconfigured providers", () => {
    const checkedAt = "2026-08-27T00:00:00.000Z";
    const states = aiProviderStates({
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "",
      providerKeys: JSON.stringify({ gemini: "enc:one", anthropic: "enc:two", openrouter: "enc:three" }),
      providerChecks: JSON.stringify({
        gemini: { status: "WORKING", model: "gemini-2.5-flash", checkedAt },
        anthropic: { status: "FAILED", model: "claude-sonnet-5", checkedAt },
      }),
    });
    expect(states.gemini.status).toBe("WORKING");
    expect(states.anthropic.status).toBe("FAILED");
    expect(states.openrouter.status).toBe("UNTESTED");
    expect(states.openai.status).toBe("NOT_CONFIGURED");
    expect(parseStoredProviderChecks("invalid")).toEqual({});
  });

  it("encrypts API keys with authenticated encryption before database storage", () => {
    const previous = process.env.AI_SETTINGS_ENCRYPTION_KEY;
    process.env.AI_SETTINGS_ENCRYPTION_KEY = "qa-only-encryption-key";
    try {
      const encrypted = encryptAiKey("provider-secret-value");
      expect(encrypted).toMatch(/^enc:v1:/);
      expect(encrypted).not.toContain("provider-secret-value");
      expect(decryptAiKey(encrypted)).toBe("provider-secret-value");
    } finally {
      if (previous === undefined) delete process.env.AI_SETTINGS_ENCRYPTION_KEY;
      else process.env.AI_SETTINGS_ENCRYPTION_KEY = previous;
    }
  });
});
