import { describe, expect, it } from "vitest";
import { computeApplicationTotal } from "../engine/leaderboard";
import { selectAttemptQuestions } from "../assessmentQuestions";
import { scoresForMode } from "../scoreModes";
import originals from "../../prisma/seed-data/original-assessment-banks.json";
import retained from "../../prisma/seed-data/generated_ccat_similar_questions.json";

describe("approval-era assessment rules", () => {
  it("keeps online and onsite scores separate, including a failed AI grading attempt", () => {
    const results = [{ type: "CCAT", mode: "ONLINE", normalized: 80, status: "PASS" }, { type: "CCAT", mode: "ONSITE", normalized: 40, status: "PENDING" }, { type: "CODING", mode: "ONLINE", normalized: 0, status: "MANUAL_REVIEW" }];
    expect(scoresForMode({ CV_SCREENING: 70, CCAT: 40 }, results, "ONLINE")).toEqual({ CV_SCREENING: 70, CCAT: 80 });
    expect(scoresForMode({ CV_SCREENING: 70, CCAT: 80 }, results, "ONSITE")).toEqual({ CV_SCREENING: 70, CCAT: 40 });
  });
  it("counts real zero as graded, null as pending, and excludes disabled phases", () => {
    const total = computeApplicationTotal({ CV_SCREENING: 80, CCAT: 0, MTT: null, CODING: 100 }, { CV_SCREENING: 10, CCAT: 15, MTT: 15 }, ["CV_SCREENING", "CCAT", "MTT"]);
    expect(total).toMatchObject({ total: 20, gradedCount: 2, assessmentCount: 3, complete: false });
  });
  it("mixes retained categories and diagrams in 80 unique stable questions", () => {
    const pool = [...originals.filter((q) => q.bank === "CCAT").map((q) => ({ number: q.number, content: JSON.stringify(q.content) })), ...retained.map((q) => ({ number: q.number, content: JSON.stringify(q) }))];
    for (let i = 0; i < 20; i++) {
      const selection = selectAttemptQuestions(pool, `mix-${i}`, "CCAT");
      expect(selection).toHaveLength(80);
      expect(new Set(selection.map((q) => q.number)).size).toBe(80);
      expect(new Set(selection.map((q) => JSON.parse(q.content).category)).size).toBe(4);
      expect(selection.some((q) => JSON.parse(q.content).imageUrl)).toBe(true);
      expect(selectAttemptQuestions(pool, `mix-${i}`, "CCAT")).toEqual(selection);
    }
  });
  it("refuses an incomplete MTT bank instead of grading a shortened test", () => {
    expect(() => selectAttemptQuestions([], "bad-bank", "MTT")).toThrow(/requires 10/);
  });
});
