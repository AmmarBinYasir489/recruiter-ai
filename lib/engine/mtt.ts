import type { Decision } from "./types";

// Mathematical Thinking Test (MTT)
// Q1-10: 3 pts, Q11-20: 4 pts, Q21-30: 5 pts. Total possible = 120.
// Correct: +points. Wrong attempted: -1. Unanswered: 0.
// Official percentage = negative-marked score / 120. Default threshold: 55%.

export const MTT_TOTAL = 120;
export const MTT_DEFAULT_THRESHOLD = 55;

export type MttAnswer = "correct" | "wrong" | "unanswered";

function pointsForQuestion(index1Based: number): number {
  if (index1Based <= 10) return 3;
  if (index1Based <= 20) return 4;
  return 5;
}

export function scoreMtt(answers: MttAnswer[], pointValues?: number[]): { raw: number; percentage: number; max: number } {
  let raw = 0;
  const usesQuestionPoints = Array.isArray(pointValues);
  let max = usesQuestionPoints ? 0 : MTT_TOTAL;
  answers.forEach((a, i) => {
    const supplied = pointValues?.[i];
    const pts = supplied === 3 || supplied === 4 || supplied === 5 ? supplied : pointsForQuestion(i + 1);
    if (usesQuestionPoints) max += pts;
    if (a === "correct") raw += pts;
    else if (a === "wrong") raw -= 1;
    // unanswered contributes 0
  });
  raw = Math.max(-max, raw); // allow negative-marked raw score
  return { raw, max, percentage: Math.round((Math.max(0, raw) / Math.max(1, max)) * 100) };
}

export function decideMtt(percentage: number, threshold = MTT_DEFAULT_THRESHOLD): Decision {
  return percentage >= threshold ? "PASS" : "FAIL";
}
