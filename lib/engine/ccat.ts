import type { Decision } from "./types";

// CCAT: 80 questions, 1 point each, 1.25% per question.
// Default portal pass/fail threshold: 55%.
export const CCAT_TOTAL = 80;
export const CCAT_QUESTION_PERCENT = 100 / CCAT_TOTAL; // 1.25
export const CCAT_DEFAULT_THRESHOLD = 55;

export function scoreCcat(correct: number, total = CCAT_TOTAL): number {
  const earned = Math.max(0, Math.min(correct, total));
  return Math.round((earned / total) * 100);
}

export function decideCcat(percentage: number, threshold = CCAT_DEFAULT_THRESHOLD): Decision {
  return percentage >= threshold ? "PASS" : "FAIL";
}
