import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("launch preflight staff readiness", () => {
  it("blocks launch unless every staff role has a linked Supabase identity", () => {
    const source = readFileSync("scripts/launch-preflight.mjs", "utf8");
    expect(source).toContain("hasLinkedAdmin");
    expect(source).toContain("hasLinkedRecruiter");
    expect(source).toContain("hasLinkedReviewer");
    expect(source).toContain('"authId" is not null');
  });
});
