import { createHash } from "crypto";

export const ASSESSMENT_QUESTION_LIMITS: Record<string, number> = {
  CCAT: 80,
  MTT: 30,
  CODING: 4,
  ESSAY: 9,
  PROMPT: 6,
};

type QuestionContent = {
  points?: number;
  difficulty?: string;
  category?: string;
};

function contentOf(question: unknown): QuestionContent {
  if (!question || typeof question !== "object") return {};
  const content = (question as { content?: unknown }).content;
  if (content && typeof content === "object") return content as QuestionContent;
  if (typeof content !== "string") return {};
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? parsed as QuestionContent : {};
  } catch {
    return {};
  }
}

function randomUnit(seed: string, index: number): number {
  const bytes = createHash("sha256").update(`${seed}:${index}`).digest();
  return bytes.readUInt32BE(0) / 0x1_0000_0000;
}

function stableShuffle<T>(items: readonly T[], seed: string): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(randomUnit(seed, i) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function allocateEvenly(keys: string[], available: Map<string, number>, total: number): Map<string, number> {
  const active = keys.filter((key) => (available.get(key) ?? 0) > 0);
  const result = new Map<string, number>();
  if (!active.length) return result;

  const base = Math.floor(total / active.length);
  let remainder = total % active.length;
  for (const key of active) {
    const requested = base + (remainder-- > 0 ? 1 : 0);
    result.set(key, Math.min(requested, available.get(key) ?? 0));
  }

  let assigned = [...result.values()].reduce((sum, count) => sum + count, 0);
  while (assigned < total) {
    let changed = false;
    for (const key of active) {
      if (assigned >= total) break;
      const current = result.get(key) ?? 0;
      const capacity = available.get(key) ?? 0;
      if (current < capacity) {
        result.set(key, current + 1);
        assigned += 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return result;
}

function selectCcatQuestions<T>(questions: T[], attemptId: string): T[] {
  const limit = ASSESSMENT_QUESTION_LIMITS.CCAT;
  const difficulties = ["EASY", "MEDIUM", "HARD"];
  const categories = ["VERBAL", "LOGICAL", "QUANTITATIVE", "SPATIAL"];
  const hasMetadata = questions.some((question) => {
    const content = contentOf(question);
    return difficulties.includes(String(content.difficulty)) && categories.includes(String(content.category));
  });
  if (!hasMetadata) return stableShuffle(questions, `${attemptId}:CCAT`).slice(0, limit);

  const byDifficulty = new Map(difficulties.map((key) => [key, questions.filter((question) => String(contentOf(question).difficulty) === key)]));
  const difficultyAllocation = allocateEvenly(
    difficulties,
    new Map(difficulties.map((key) => [key, byDifficulty.get(key)?.length ?? 0])),
    Math.min(limit, questions.length),
  );

  const selected: T[] = [];
  for (const difficulty of difficulties) {
    const bucket = byDifficulty.get(difficulty) ?? [];
    const slots = difficultyAllocation.get(difficulty) ?? 0;
    const categoryAllocation = allocateEvenly(
      categories,
      new Map(categories.map((key) => [key, bucket.filter((question) => String(contentOf(question).category) === key).length])),
      slots,
    );
    for (const category of categories) {
      const categoryBucket = bucket.filter((question) => String(contentOf(question).category) === category);
      selected.push(...stableShuffle(categoryBucket, `${attemptId}:CCAT:${difficulty}:${category}`).slice(0, categoryAllocation.get(category) ?? 0));
    }
  }
  return stableShuffle(selected, `${attemptId}:CCAT:order`);
}

function selectMttQuestions<T>(questions: T[], attemptId: string): T[] {
  const sections = [3, 4, 5];
  const selected = sections.flatMap((points) => {
    const bucket = questions.filter((question) => Number(contentOf(question).points) === points);
    if (bucket.length < 10) {
      throw new Error(`MTT question bank incomplete: need at least 10 questions worth ${points} points.`);
    }
    return stableShuffle(bucket, `${attemptId}:MTT:${points}`).slice(0, 10);
  });
  return selected;
}

/** Stable for refresh/submission, but different for each candidate attempt. */
export function selectAttemptQuestions<T>(questions: T[], attemptId: string, bank: string): T[] {
  if (bank === "CCAT") return selectCcatQuestions(questions, attemptId);
  if (bank === "MTT") return selectMttQuestions(questions, attemptId);
  const shuffled = stableShuffle(questions, `${attemptId}:${bank}`);
  return shuffled.slice(0, Math.min(ASSESSMENT_QUESTION_LIMITS[bank] ?? shuffled.length, shuffled.length));
}
