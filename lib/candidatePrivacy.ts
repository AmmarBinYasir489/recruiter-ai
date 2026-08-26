const PUBLIC_SCORE_STAGES = new Set(["CV_SCREENING", "CCAT", "MTT"]);
const RESTRICTED_SCORE_PATTERN = /\b(GAMES?|CODING|ESSAY|PROMPT(?: ENGINEERING)?|ENGLISH(?: SPEAKING)?)\b/i;

export function candidateCanSeeScore(stage: string): boolean {
  return PUBLIC_SCORE_STAGES.has(stage);
}

export function candidateSafeNotification(message: string): string {
  if (RESTRICTED_SCORE_PATTERN.test(message) && /(?:\d+\s*\/\s*100|\bPASS\b|\bFAIL\b|AI-assisted score)/i.test(message)) {
    return "Your assessment has been reviewed. The recruitment team will notify you when the next action is available.";
  }
  return message;
}
