import { describe, expect, it } from "vitest";
import { formatProfileValue } from "@/lib/cv/profileDisplay";

describe("formatProfileValue", () => {
  it("renders structured CV projects instead of JavaScript object coercion", () => {
    const value = [{ name: "Fraud API", description: "Python scoring service", url: "https://example.test/repo" }];
    const displayed = formatProfileValue(value);
    expect(displayed).toBe("Fraud API — Python scoring service — https://example.test/repo");
    expect(displayed).not.toContain("[object Object]");
  });

  it("preserves legacy arrays and empty placeholders", () => {
    expect(formatProfileValue(["Python", "SQL"])).toBe("Python; SQL");
    expect(formatProfileValue([])).toBe("—");
  });
});
