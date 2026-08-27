import { getAiRuntimeConfig, type AiRuntimeConfig } from "@/lib/ai/config";

interface GenerateOptions {
  prompt: string;
  json?: boolean;
  document?: { mime: string; base64: string };
  timeoutMs?: number;
  config?: AiRuntimeConfig;
}

function providerError(provider: string, status: number, body: any) {
  const detail = body?.error?.message || body?.error?.type || body?.message || "provider error";
  return new Error(`${provider} request failed (${status}): ${String(detail).slice(0, 220)}`);
}

async function callWithKey(config: AiRuntimeConfig, key: string, options: GenerateOptions, signal: AbortSignal) {
  const { provider, model } = config;
  const prompt = options.json ? `${options.prompt}\nReturn only valid JSON without markdown fences.` : options.prompt;

  if (provider === "gemini") {
    const parts: any[] = [{ text: prompt }];
    if (options.document) parts.push({ inlineData: { mimeType: options.document.mime, data: options.document.base64 } });
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts }], ...(options.json ? { generationConfig: { responseMimeType: "application/json" } } : {}) }),
      signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw providerError("Gemini", response.status, body);
    const text = body?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join("") || "";
    if (!text) throw new Error("Gemini returned no content.");
    return text;
  }

  if (provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
      signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw providerError("Claude", response.status, body);
    const text = body?.content?.filter((part: any) => part?.type === "text").map((part: any) => part.text).join("") || "";
    if (!text) throw new Error("Claude returned no content.");
    return text;
  }

  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: prompt }),
      signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw providerError("OpenAI", response.status, body);
    const text = body?.output_text || body?.output?.flatMap((item: any) => item?.content || []).filter((part: any) => part?.type === "output_text").map((part: any) => part?.text || "").join("") || "";
    if (!text) throw new Error("OpenAI returned no content.");
    return text;
  }

  const endpoint = provider === "openrouter"
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.groq.com/openai/v1/chat/completions";
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
  if (provider === "openrouter") {
    headers["X-OpenRouter-Title"] = "Recruiter AI";
    if (process.env.APP_URL) headers["HTTP-Referer"] = process.env.APP_URL;
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], ...(options.json ? { response_format: { type: "json_object" } } : {}) }),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(provider === "openrouter" ? "OpenRouter" : "Groq", response.status, body);
  const text = body?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error(`${provider === "openrouter" ? "OpenRouter" : "Groq"} returned no content.`);
  return text;
}

export async function generateAiText(options: GenerateOptions): Promise<string> {
  const config = options.config || await getAiRuntimeConfig();
  if (!config.apiKey) throw new Error(`No ${config.provider} API key is configured.`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 35000);
  try {
    try {
      return await callWithKey(config, config.apiKey, options, controller.signal);
    } catch (error) {
      if (!config.fallbackApiKey) throw error;
      return await callWithKey(config, config.fallbackApiKey, options, controller.signal);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function testAiProvider(config: AiRuntimeConfig) {
  try {
    await generateAiText({ prompt: "Reply with exactly OK.", timeoutMs: 20000, config });
    return { ok: true, message: `${config.provider} connected with ${config.model}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Connection failed." };
  }
}

