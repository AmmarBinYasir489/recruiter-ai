import type { Decision } from "./types";

// Coding AI-grading rubric. Each criterion 0-100.
// Correctness 35, Code quality 20, Logic 20, Efficiency 15, Best practices 10.
export const CODING_RUBRIC: Record<string, number> = {
  correctness: 35,
  codeQuality: 20,
  logic: 20,
  efficiency: 15,
  bestPractices: 10,
};

// Each coding question worth 10 raw points; default pipeline = 4 questions = 40 max.
export const CODING_QUESTION_POINTS = 10;
export const CODING_DEFAULT_QUESTIONS = 4;
export const CODING_DEFAULT_MAX = CODING_QUESTION_POINTS * CODING_DEFAULT_QUESTIONS;

export function scoreCodingByRubric(c: {
  correctness: number;
  codeQuality: number;
  logic: number;
  efficiency: number;
  bestPractices: number;
}): number {
  const total =
    c.correctness * CODING_RUBRIC.correctness +
    c.codeQuality * CODING_RUBRIC.codeQuality +
    c.logic * CODING_RUBRIC.logic +
    c.efficiency * CODING_RUBRIC.efficiency +
    c.bestPractices * CODING_RUBRIC.bestPractices;
  return Math.round(total / 100);
}

export function codingRawToPercent(raw: number, max = CODING_DEFAULT_MAX): number {
  return Math.round(Math.max(0, Math.min(raw, max)) * (100 / max));
}
