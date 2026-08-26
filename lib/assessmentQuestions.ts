import { createHash } from "crypto";

export const ASSESSMENT_QUESTION_LIMITS: Record<string, number> = {
  CCAT: 80,
  MTT: 30,
  CODING: 4,
  ESSAY: 9,
  PROMPT: 6,
};

function randomUnit(seed: string, index: number): number {
  const bytes = createHash("sha256").update(`${seed}:${index}`).digest();
  return bytes.readUInt32BE(0) / 0x1_0000_0000;
}

/** Stable for refresh/submission, but different for each candidate attempt. */
export function selectAttemptQuestions<T>(questions: T[], attemptId: string, bank: string): T[] {
  const shuffled = [...questions];
  const seed = `${attemptId}:${bank}`;
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(randomUnit(seed, i) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(ASSESSMENT_QUESTION_LIMITS[bank] ?? shuffled.length, shuffled.length));
}
