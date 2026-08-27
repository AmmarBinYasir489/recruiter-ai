export const AI_PROVIDERS = ["gemini", "openai", "anthropic", "groq", "openrouter"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

export interface AiModelOption {
  id: string;
  label: string;
}

export const AI_PROVIDER_OPTIONS: Array<{ id: AiProvider; label: string; models: AiModelOption[] }> = [
  {
    id: "gemini",
    label: "Google Gemini",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI (ChatGPT models)",
    models: [
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna (fast / economical)" },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra (balanced)" },
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol (highest quality)" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    models: [
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
      { id: "claude-opus-5", label: "Claude Opus 5" },
      { id: "claude-fable-5", label: "Claude Fable 5" },
    ],
  },
  {
    id: "groq",
    label: "Groq",
    models: [
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter (Hermes and 400+ models)",
    models: [
      { id: "nousresearch/hermes-4-70b", label: "Hermes 4 70B" },
      { id: "nousresearch/hermes-4-405b", label: "Hermes 4 405B" },
      { id: "nousresearch/hermes-3-llama-3.1-405b:free", label: "Hermes 3 405B (free when available)" },
    ],
  },
];

const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-5.6-luna",
  anthropic: "claude-haiku-4-5",
  groq: "llama-3.1-8b-instant",
  openrouter: "nousresearch/hermes-4-70b",
};

export function normalizeAiProvider(value: unknown): AiProvider {
  const candidate = String(value || "").trim().toLowerCase();
  return (AI_PROVIDERS as readonly string[]).includes(candidate) ? candidate as AiProvider : "gemini";
}

export function defaultModelFor(provider: AiProvider): string {
  return DEFAULT_MODELS[provider];
}

export function normalizeAiModel(provider: AiProvider, value: unknown): string {
  const candidate = String(value || "").trim();
  if (!candidate) return defaultModelFor(provider);
  if (candidate.length > 160 || !/^[a-zA-Z0-9][a-zA-Z0-9._:/~-]*$/.test(candidate)) {
    throw new Error("Invalid model ID. Use only letters, numbers, dots, dashes, slashes, colons, underscores, or tildes.");
  }
  return candidate;
}
