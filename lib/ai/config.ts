import crypto from "crypto";
import { prisma } from "@/lib/db";
import { AI_PROVIDERS, defaultModelFor, normalizeAiModel, normalizeAiProvider, type AiProvider } from "@/lib/ai/providers";

export interface AiRuntimeConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  fallbackApiKey: string;
}

function encryptionKey() {
  const material = process.env.AI_SETTINGS_ENCRYPTION_KEY || "";
  return material ? crypto.createHash("sha256").update(material).digest() : null;
}

export function encryptAiKey(value: string) {
  const key = encryptionKey();
  if (!key) throw new Error("Set AI_SETTINGS_ENCRYPTION_KEY before storing an AI key.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `enc:v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptAiKey(value: string) {
  if (!value.startsWith("enc:v1:")) return value;
  const key = encryptionKey();
  if (!key) return "";
  try {
    const [, , ivRaw, tagRaw, encryptedRaw] = value.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export type StoredProviderKeys = Partial<Record<AiProvider, string>>;
export type AiProviderCheckStatus = "WORKING" | "FAILED";
export interface AiProviderCheck {
  status: AiProviderCheckStatus;
  model: string;
  checkedAt: string;
}
export type StoredProviderChecks = Partial<Record<AiProvider, AiProviderCheck>>;
export type AiProviderUiStatus = "NOT_CONFIGURED" | "UNTESTED" | AiProviderCheckStatus;
export interface AiProviderState {
  configured: boolean;
  keySource: "STORED" | "ENVIRONMENT" | "STORED_AND_ENVIRONMENT" | "NONE";
  status: AiProviderUiStatus;
  model?: string;
  checkedAt?: string;
}

export function parseStoredProviderKeys(value?: string | null): StoredProviderKeys {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function parseStoredProviderChecks(value?: string | null): StoredProviderChecks {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function configuredAiProviders(settings?: { provider: string; apiKey: string; providerKeys?: string | null } | null): AiProvider[] {
  if (!settings) return [];
  const keys = parseStoredProviderKeys(settings.providerKeys);
  const configured = Object.entries(keys).filter(([, value]) => Boolean(value)).map(([provider]) => normalizeAiProvider(provider));
  if (settings.apiKey && !configured.includes(normalizeAiProvider(settings.provider))) configured.push(normalizeAiProvider(settings.provider));
  return configured;
}

function environmentKey(provider: AiProvider) {
  const keys: Record<AiProvider, string | undefined> = {
    gemini: process.env.GEMINI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    groq: process.env.GROQ_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
  };
  return keys[provider] || "";
}

export function hasAiEnvironmentKey(provider: AiProvider) {
  return Boolean(environmentKey(provider));
}

export function aiProviderStates(settings?: { provider: string; model: string; apiKey: string; providerKeys?: string | null; providerChecks?: string | null } | null): Record<AiProvider, AiProviderState> {
  const keys = parseStoredProviderKeys(settings?.providerKeys);
  const checks = parseStoredProviderChecks(settings?.providerChecks);
  return Object.fromEntries(AI_PROVIDERS.map((provider) => {
    const stored = Boolean(keys[provider] || (provider === normalizeAiProvider(settings?.provider) && settings?.apiKey));
    const environment = hasAiEnvironmentKey(provider);
    const configured = stored || environment;
    const check = checks[provider];
    const keySource = stored && environment ? "STORED_AND_ENVIRONMENT" : stored ? "STORED" : environment ? "ENVIRONMENT" : "NONE";
    return [provider, {
      configured,
      keySource,
      status: configured ? check?.status || "UNTESTED" : "NOT_CONFIGURED",
      model: check?.model,
      checkedAt: check?.checkedAt,
    }];
  })) as Record<AiProvider, AiProviderState>;
}

export function environmentModelFor(provider: AiProvider) {
  const models: Record<AiProvider, string | undefined> = {
    gemini: process.env.GEMINI_MODEL,
    openai: process.env.OPENAI_MODEL,
    anthropic: process.env.ANTHROPIC_MODEL,
    groq: process.env.GROQ_MODEL,
    openrouter: process.env.OPENROUTER_MODEL,
  };
  return models[provider] || defaultModelFor(provider);
}

export async function getAiRuntimeConfig(providerOverride?: string, modelOverride?: string): Promise<AiRuntimeConfig> {
  const settings = await prisma.aiSetting.findUnique({ where: { id: "singleton" } });
  const provider = normalizeAiProvider(providerOverride || settings?.provider || process.env.AI_PROVIDER);
  const keyMap = parseStoredProviderKeys(settings?.providerKeys);
  const encryptedKey = keyMap[provider] || (provider === normalizeAiProvider(settings?.provider) ? settings?.apiKey : "") || "";
  let storedKey = encryptedKey ? decryptAiKey(encryptedKey) : "";

  // Transparently migrate a legacy plaintext database key into authenticated encryption.
  if (encryptedKey && storedKey && !encryptedKey.startsWith("enc:v1:") && encryptionKey()) {
    const encrypted = encryptAiKey(storedKey);
    if (keyMap[provider]) {
      keyMap[provider] = encrypted;
      await prisma.aiSetting.update({ where: { id: "singleton" }, data: { providerKeys: JSON.stringify(keyMap) } });
    } else {
      await prisma.aiSetting.update({ where: { id: "singleton" }, data: { apiKey: encrypted } });
    }
  }

  const envKey = environmentKey(provider);
  const selectedModel = modelOverride || (provider === normalizeAiProvider(settings?.provider) ? settings?.model : "") || environmentModelFor(provider);
  const model = normalizeAiModel(provider, selectedModel);
  return {
    provider,
    apiKey: storedKey || envKey || "",
    model,
    // A stale database key must not mask a valid deployment key forever.
    fallbackApiKey: storedKey && envKey && storedKey !== envKey ? envKey : "",
  };
}
