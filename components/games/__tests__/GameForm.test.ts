import { describe, expect, it } from "vitest";
import { shouldPreventGameFormKey } from "@/lib/games/keyboard";

describe("game assessment keyboard submission guard", () => {
  it("blocks Enter so a puzzle input cannot submit the whole assessment", () => {
    expect(shouldPreventGameFormKey("Enter")).toBe(true);
  });

  it("does not block ordinary puzzle input keys", () => {
    expect(shouldPreventGameFormKey("5")).toBe(false);
    expect(shouldPreventGameFormKey("Tab")).toBe(false);
  });
});
