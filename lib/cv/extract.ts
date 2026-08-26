
// Best-effort text extraction from uploaded CV files. PDF/DOCX use pure-JS
// libraries; DOC and unsupported formats fall back to an empty string so the
// caller can rely on the deterministic heuristic parser instead of crashing.

export async function extractTextFromBuffer(buf: Buffer, fileName: string, mime: string): Promise<string> {
  const lower = fileName.toLowerCase();
  try {
    if (lower.endsWith(".pdf") || mime === "application/pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buf });
      try {
        const out = await parser.getText();
        return out.text || "";
      } finally {
        await parser.destroy();
      }
    }
    if (lower.endsWith(".docx") || mime.includes("officedocument.wordprocessingml")) {
      const mammoth = (await import("mammoth")).default as any;
      const out = await mammoth.extractRawText({ buffer: buf });
      return (out?.value as string) || "";
    }
    if (lower.endsWith(".doc") || mime === "application/msword") {
      return ""; // no reliable pure-JS DOC parser; heuristic fallback
    }
    return buf.toString("utf8");
  } catch {
    return "";
  }
}
