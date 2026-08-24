import type { Decision } from "./types";

// Prompt Engineering AI-grading rubric. Each criterion 0-100.
// Prompt design 25, Clarity 20, Structure 15, Reasoning 20, Outcome 20.
export const PROMPT_RUBRIC: Record<string, number> = {
  promptDesign: 25,
  clarity: 20,
  structure: 15,
  reasoning: 20,
  outcome: 20,
};

// Default bank = 6 questions, 10 points each = 60 max.
export const PROMPT_QUESTION_POINTS = 10;
export const PROMPT_DEFAULT_QUESTIONS = 6;
export const PROMPT_DEFAULT_MAX = PROMPT_QUESTION_POINTS * PROMPT_DEFAULT_QUESTIONS;

export function scorePromptByRubric(c: {
  promptDesign: number;
  clarity: number;
  structure: number;
  reasoning: number;
  outcome: number;
}): number {
  const total =
    c.promptDesign * PROMPT_RUBRIC.promptDesign +
    c.clarity * PROMPT_RUBRIC.clarity +
    c.structure * PROMPT_RUBRIC.structure +
    c.reasoning * PROMPT_RUBRIC.reasoning +
    c.outcome * PROMPT_RUBRIC.outcome;
  return Math.round(total / 100);
}

export function promptRawToPercent(raw: number, max = PROMPT_DEFAULT_MAX): number {
  return Math.round(Math.max(0, Math.min(raw, max)) * (100 / max));
}

export function decideByThreshold(percentage: number, threshold: number): Decision {
  return percentage >= threshold ? "PASS" : "FAIL";
}
