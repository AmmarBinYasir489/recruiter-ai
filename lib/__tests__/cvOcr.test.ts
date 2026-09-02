import { describe, expect, it } from "vitest";
import { chooseCvText } from "../cv/ocr";

describe("CV OCR text selection", () => {
  it("uses OCR for a scanned document without a native text layer", () => {
    const result = chooseCvText("", "PROJECTS\nFraud detector\nWORK EXPERIENCE\nEngineer at Acme");
    expect(result.method).toBe("DOCUMENT_OCR");
    expect(result.text).toContain("Fraud detector");
  });

  it("keeps native text when an OCR response is truncated", () => {
    const nativeText = `EDUCATION\n${"Computer Science ".repeat(30)}\nPROJECTS\nMatching engine`;
    const result = chooseCvText(nativeText, "Short response");
    expect(result.method).toBe("NATIVE_FALLBACK");
    expect(result.text).toContain("Matching engine");
  });

  it("prefers OCR when it recovers more evidence sections", () => {
    const nativeText = "Muhammad Example\nEducation text that is long enough to be readable";
    const ocrText = "Muhammad Example\nEDUCATION\nBS CS\nPROJECTS\nAI assistant\nWORK EXPERIENCE\nML Intern";
    expect(chooseCvText(nativeText, ocrText).method).toBe("DOCUMENT_OCR");
  });
});
