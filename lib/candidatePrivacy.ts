export function candidateCanSeeScore(stage: string): boolean {
  void stage;
  return false;
}

export function candidateSafeNotification(message: string, suppressFailure = false): string {
  const safe = message
    .replace(/Your CV (?:screening )?result (?:is|was re-evaluated and is now:)\s*(?:PASS|FAIL)[^.]*\.?/gi, "Your CV screening is complete and is with the recruitment team.")
    .replace(/\s*\(\s*\d+(?:\.\d+)?\s*\/\s*100\s*\)/gi, "")
    .replace(/\b(?:current\s+)?score\s*(?:is|:)\s*\d+(?:\.\d+)?\s*\/\s*100[.,]?/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s*\/\s*100\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (suppressFailure && /\bresult is FAIL\b/i.test(safe)) {
    return "Your assessment has been reviewed. The recruitment team will notify you about the next step.";
  }
  return safe;
}
