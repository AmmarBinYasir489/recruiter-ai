import type { Decision } from "./types";

// Essay AI-grading rubric. Each criterion 0-100.
// Understanding 25, Communication 20, Critical thinking 20, Problem solving 20, Domain 15.
export const ESSAY_RUBRIC: Record<string, number> = {
  understanding: 25,
  communication: 20,
  criticalThinking: 20,
  problemSolving: 20,
  domainKnowledge: 15,
};

// Full question bank: 5 short (10 pts) + 4 descriptive (20 pts) = 130 max.
export const ESSAY_SHORT_MAX = 50;
export const ESSAY_DESCRIPTIVE_MAX = 80;
export const ESSAY_BANK_MAX = 130;
export const ESSAY_SHORT_MIN_WORDS = 50;
export const ESSAY_DESCRIPTIVE_MIN_WORDS = 250;

export function scoreEssayByRubric(c: {
  understanding: number;
  communication: number;
  criticalThinking: number;
  problemSolving: number;
  domainKnowledge: number;
}): number {
  const total =
    c.understanding * ESSAY_RUBRIC.understanding +
    c.communication * ESSAY_RUBRIC.communication +
    c.criticalThinking * ESSAY_RUBRIC.criticalThinking +
    c.problemSolving * ESSAY_RUBRIC.problemSolving +
    c.domainKnowledge * ESSAY_RUBRIC.domainKnowledge;
  return Math.round(total / 100); // weights sum to 100
}

export function essayRawToPercent(raw: number, max = ESSAY_BANK_MAX): number {
  return Math.round(Math.max(0, Math.min(raw, max)) * (100 / max));
}
