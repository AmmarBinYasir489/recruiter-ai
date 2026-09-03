import { prisma, j, uj } from "@/lib/db";
import { selectAttemptQuestions, ASSESSMENT_QUESTION_LIMITS } from "@/lib/assessmentQuestions";

type SnapshotQuestion = { number: number; content: string };

// Never pass this snapshot (which includes answer keys) to a client component.
export async function attemptQuestions(attemptId: string, bank: string): Promise<SnapshotQuestion[]> {
  if (!ASSESSMENT_QUESTION_LIMITS[bank]) return [];
  const attempt = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  if (attempt.type !== bank) throw new Error("Assessment type mismatch.");
  if (attempt.questionSnapshot) return uj<SnapshotQuestion[]>(attempt.questionSnapshot);
  const pool = await prisma.question.findMany({ where: { bank }, orderBy: { number: "asc" }, select: { number: true, content: true } });
  const selected = selectAttemptQuestions(pool, attemptId, bank);
  if (selected.length !== ASSESSMENT_QUESTION_LIMITS[bank]) throw new Error("The question bank is incomplete. Contact the recruitment team; your test has not been graded.");
  const saved = await prisma.assessmentAttempt.updateMany({ where: { id: attemptId, questionSnapshot: null }, data: { questionSnapshot: j(selected) } });
  if (saved.count) return selected;
  const winner = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  return uj<SnapshotQuestion[]>(winner.questionSnapshot);
}
