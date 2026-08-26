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

  it("keeps the old CCAT balance across difficulty and category", () => {
    const difficulties = ["EASY", "MEDIUM", "HARD"];
    const categories = ["VERBAL", "LOGICAL", "QUANTITATIVE", "SPATIAL"];
    const balanced = difficulties.flatMap((difficulty) =>
      categories.flatMap((category) =>
        Array.from({ length: 10 }, (_, index) => ({
          number: `${difficulty}-${category}-${index}`,
          content: JSON.stringify({ difficulty, category }),
        })),
      ),
    );
    const selected = selectAttemptQuestions(balanced, "balanced-attempt", "CCAT");
    expect(selected).toHaveLength(80);
    const selectedDifficulties = selected.map((question) => JSON.parse(question.content).difficulty);
    expect(selectedDifficulties.filter((value) => value === "EASY")).toHaveLength(27);
    expect(selectedDifficulties.filter((value) => value === "MEDIUM")).toHaveLength(27);
    expect(selectedDifficulties.filter((value) => value === "HARD")).toHaveLength(26);
  });

  it("serves MTT as three point-safe sections of ten", () => {
    const mtt = [3, 4, 5].flatMap((points) =>
      Array.from({ length: 12 }, (_, index) => ({
        number: `${points}-${index}`,
        content: JSON.stringify({ points }),
      })),
    );
    const selected = selectAttemptQuestions(mtt, "mtt-attempt", "MTT");
    expect(selected).toHaveLength(30);
    expect(selected.slice(0, 10).every((question) => JSON.parse(question.content).points === 3)).toBe(true);
    expect(selected.slice(10, 20).every((question) => JSON.parse(question.content).points === 4)).toBe(true);
    expect(selected.slice(20).every((question) => JSON.parse(question.content).points === 5)).toBe(true);
  });
});
