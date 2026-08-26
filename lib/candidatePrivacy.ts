export function candidateCanSeeScore(stage: string): boolean {
  void stage;
  return false;
}

export function candidateSafeNotification(message: string): string {
  return message
    .replace(/\s*\(\s*\d+(?:\.\d+)?\s*\/\s*100\s*\)/gi, "")
    .replace(/\b(?:current\s+)?score\s*(?:is|:)\s*\d+(?:\.\d+)?\s*\/\s*100[.,]?/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s*\/\s*100\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
