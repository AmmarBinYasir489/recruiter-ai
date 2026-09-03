import { prisma, j, uj } from "@/lib/db";
import { generateWordSearch, type WordSearchPuzzle } from "./wordSearch";
export async function getAttemptPuzzle(attemptId: string): Promise<WordSearchPuzzle> {
  const attempt = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  if (attempt.type !== "GAMES") throw new Error("Assessment type mismatch.");
  if (attempt.questionSnapshot) {
    const saved = uj<{ wordSearch: WordSearchPuzzle }>(attempt.questionSnapshot);
    if (saved?.wordSearch?.version !== 2) throw new Error("This game version requires a reissue from the recruiter.");
    return saved.wordSearch;
  }
  const puzzle = generateWordSearch(attemptId);
  const saved = await prisma.assessmentAttempt.updateMany({ where: { id: attemptId, questionSnapshot: null }, data: { questionSnapshot: j({ wordSearch: puzzle }) } });
  return saved.count ? puzzle : getAttemptPuzzle(attemptId);
}
