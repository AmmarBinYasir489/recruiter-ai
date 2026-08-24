import crypto from "crypto";
import { prisma } from "@/lib/db";

type Provider = "gemini" | "groq";

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

export async function getAiRuntimeConfig(providerOverride?: string) {
  const settings = await prisma.aiSetting.findUnique({ where: { id: "singleton" } });
  const selected = (providerOverride || settings?.provider || process.env.AI_PROVIDER || "gemini").toLowerCase();
  const provider: Provider = selected === "groq" ? "groq" : "gemini";
  let storedKey = settings?.apiKey ? decryptAiKey(settings.apiKey) : "";

  // Transparently migrate a legacy plaintext database key into authenticated encryption.
  if (settings?.apiKey && storedKey && !settings.apiKey.startsWith("enc:v1:") && encryptionKey()) {
    await prisma.aiSetting.update({ where: { id: "singleton" }, data: { apiKey: encryptAiKey(storedKey) } });
  }

  const envKey = provider === "groq" ? process.env.GROQ_API_KEY : process.env.GEMINI_API_KEY;
  const model = provider === "gemini"
    ? process.env.GEMINI_MODEL || "gemini-1.5-flash"
    : process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  return { provider, apiKey: storedKey || envKey || "", model };
}
