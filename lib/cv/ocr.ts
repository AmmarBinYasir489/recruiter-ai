import { generateAiText } from "@/lib/ai/client";
import { getAiRuntimeConfig } from "@/lib/ai/config";

export type CvTextMethod = "NATIVE_TEXT" | "DOCUMENT_OCR" | "NATIVE_FALLBACK";

function normalizedText(value: string) {
  return value.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
}

function evidenceHeadingCount(value: string) {
  return [
    /\bprojects?\b/i,
    /\b(?:work )?experience\b/i,
    /\beducation\b/i,
    /\b(?:technical )?skills\b/i,
    /\bcertifications?\b/i,
    /\bcoursework\b/i,
  ].filter((pattern) => pattern.test(value)).length;
}

// Prefer OCR when it recovers meaningful text or section structure, while
// retaining a healthy native text layer if the vision response is truncated.
export function chooseCvText(nativeValue: string, ocrValue: string) {
  const nativeText = normalizedText(nativeValue);
  const ocrText = normalizedText(ocrValue);
  if (!ocrText) return { text: nativeText, method: "NATIVE_FALLBACK" as const };
  if (!nativeText) return { text: ocrText, method: "DOCUMENT_OCR" as const };
  const ocrHasMoreStructure = evidenceHeadingCount(ocrText) > evidenceHeadingCount(nativeText);
  const ocrHasEnoughContent = ocrText.length >= Math.max(120, Math.round(nativeText.length * 0.65));
  return ocrHasMoreStructure || ocrHasEnoughContent
    ? { text: ocrText, method: "DOCUMENT_OCR" as const }
    : { text: nativeText, method: "NATIVE_FALLBACK" as const };
}

export async function ocrCvDocument(buffer: Buffer, mime: string, nativeValue: string) {
  if (mime !== "application/pdf" && !mime.startsWith("image/")) {
    return { text: normalizedText(nativeValue), method: "NATIVE_TEXT" as CvTextMethod };
  }

  try {
    // The current document transport is implemented for Gemini. Never send a
    // private CV to a provider other than the one selected by the admin.
    const config = await getAiRuntimeConfig();
    if (config.provider !== "gemini" || !config.apiKey) {
      return { text: normalizedText(nativeValue), method: "NATIVE_FALLBACK" as CvTextMethod };
    }
    const ocrText = await generateAiText({
      config,
      document: { mime, base64: buffer.toString("base64") },
      timeoutMs: 45000,
      prompt: [
        "OCR and transcribe this CV document into plain text.",
        "Preserve every visible heading, bullet, project, job title, company, location, date range, certification, URL, and coursework item.",
        "Keep the original reading order. Do not summarize, score, infer, or invent missing information.",
        "Return only the transcription.",
      ].join(" "),
    });
    return chooseCvText(nativeValue, ocrText);
  } catch {
    return { text: normalizedText(nativeValue), method: "NATIVE_FALLBACK" as CvTextMethod };
  }
}
