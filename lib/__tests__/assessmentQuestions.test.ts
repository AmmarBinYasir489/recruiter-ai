import { describe, expect, it } from "vitest";
import { selectAttemptQuestions } from "../assessmentQuestions";

describe("per-attempt question selection", () => {
  const bank = Array.from({ length: 200 }, (_, index) => ({ number: index + 1 }));

  it("selects 80 unique CCAT questions and stays stable on refresh", () => {
    const first = selectAttemptQuestions(bank, "attempt-a", "CCAT");
    expect(first).toHaveLength(80);
    expect(new Set(first.map((q) => q.number)).size).toBe(80);
    expect(selectAttemptQuestions(bank, "attempt-a", "CCAT")).toEqual(first);
  });

  it("uses a different ordering/set for another attempt", () => {
    expect(selectAttemptQuestions(bank, "attempt-b", "CCAT")).not.toEqual(
      selectAttemptQuestions(bank, "attempt-a", "CCAT"),
    );
  });
});
