type StageResult = { type: string };

// A newly released phase has no result yet. Never substitute a result from the
// previous phase, because that makes the candidate think the old phase is still
// current and can expose the wrong score/decision beside the new phase.
export function resultForCurrentStage<T extends StageResult>(results: T[], currentStage: string): T | undefined {
  return results.find((result) => result.type === currentStage);
}
