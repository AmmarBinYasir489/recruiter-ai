import type { TciComponent } from "./types";

// Total Candidate Index (TCI) — weighted final score.
// Default weights (sum 100): CV10, Games10, CCAT15, MTT15, Essay10, Coding25, Prompt15.
// Spoken English & RAT are deliberately excluded from the default TCI.
// Drive may define different positive weights; enabled weights are normalized to 100.
// Assessments not included in a drive are removed from that drive's TCI.

export const TCI_DEFAULT_WEIGHTS: Record<string, number> = {
  CV_SCREENING: 10,
  GAMES: 10,
  CCAT: 15,
  MTT: 15,
  ESSAY: 10,
  CODING: 25,
  PROMPT: 15,
};

export function computeTci(components: TciComponent[]): number {
  const enabled = components.filter((c) => c.enabled);
  const weightSum = enabled.reduce((s, c) => s + Math.max(0, c.weight), 0);
  if (weightSum === 0 || enabled.length === 0) return 0;
  const weighted = enabled.reduce(
    (s, c) => s + c.score * Math.max(0, c.weight),
    0,
  );
  return Math.round(weighted / weightSum);
}
