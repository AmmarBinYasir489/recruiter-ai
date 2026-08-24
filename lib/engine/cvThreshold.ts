import type { Decision, ThresholdApplication } from "./types";
export type { ThresholdApplication } from "./types";

export interface ThresholdPreview {
  futureOnly?: boolean;
  currentThreshold: number;
  proposedThreshold: number;
  eligible: number;
  passToFail: number;
  failToPass: number;
  unchanged: number;
  // per-application detail (read-only, no mutation)
  details: Array<{
    id: string;
    cvScore: number;
    oldResult: Decision;
    newResult: Decision;
    changed: boolean;
  }>;
}

function decide(score: number, threshold: number): Decision {
  return score >= threshold ? "PASS" : "FAIL";
}

// Read-only preview of a threshold change. Must NOT mutate anything.
export function previewThresholdChange(
  currentThreshold: number,
  proposedThreshold: number,
  applications: ThresholdApplication[],
): ThresholdPreview {
  let passToFail = 0;
  let failToPass = 0;
  let unchanged = 0;
  const details = applications.map((a) => {
    const oldResult = decide(a.cvScore, currentThreshold);
    const newResult = decide(a.cvScore, proposedThreshold);
    const changed = oldResult !== newResult;
    if (changed) {
      if (newResult === "FAIL") passToFail++;
      else failToPass++;
    } else {
      unchanged++;
    }
    return { id: a.id, cvScore: a.cvScore, oldResult, newResult, changed };
  });
  return {
    currentThreshold,
    proposedThreshold,
    eligible: applications.length,
    passToFail,
    failToPass,
    unchanged,
    details,
  };
}

export interface ThresholdResultChange {
  id: string;
  cvScore: number;
  oldResult: Decision;
  newResult: Decision;
  changed: boolean;
  reason: string;
}

// Apply the new threshold to the SAME drive's applications, comparing the
// committed old result vs the new result. Notifications are only emitted for
// `changed` entries by the caller. The existing AI cvScore is reused — the
// threshold change never re-runs AI analysis.
export function applyThresholdToApplications(
  applications: ThresholdApplication[],
  newThreshold: number,
  actorId: string,
  changedAt: string,
): ThresholdResultChange[] {
  return applications.map((a) => {
    const previousResult = a.cvResult; // committed result under the old threshold
    const newResult = decide(a.cvScore, newThreshold);
    const changed = previousResult !== newResult;
    return {
      id: a.id,
      cvScore: a.cvScore,
      oldResult: previousResult,
      newResult,
      changed,
      reason: changed ? `Recruiter threshold update to ${newThreshold} (by ${actorId} @ ${changedAt})` : "",
    };
  });
}

// ---- Generic phase-threshold engine (CV or any scored phase) ----
// The same two-step, read-only-preview / explicit-apply model applies to every
// phase that has a numeric pass threshold (CV, CCAT, MTT, Games, Coding, etc.).
// Changing a threshold NEVER re-runs AI analysis; only the decision changes.

export interface PhaseApplication {
  id: string;
  score: number; // already-computed 0-100 score for the phase
  result: Decision; // committed PASS/FAIL under the old threshold
}

export function previewPhaseThreshold(
  currentThreshold: number,
  proposedThreshold: number,
  applications: PhaseApplication[],
): ThresholdPreview {
  let passToFail = 0;
  let failToPass = 0;
  let unchanged = 0;
  const details = applications.map((a) => {
    const oldResult = decide(a.score, currentThreshold);
    const newResult = decide(a.score, proposedThreshold);
    const changed = oldResult !== newResult;
    if (changed) {
      if (newResult === "FAIL") passToFail++;
      else failToPass++;
    } else {
      unchanged++;
    }
    return { id: a.id, cvScore: a.score, oldResult, newResult, changed };
  });
  return {
    currentThreshold,
    proposedThreshold,
    eligible: applications.length,
    passToFail,
    failToPass,
    unchanged,
    details,
  };
}

export function applyPhaseThreshold(
  applications: PhaseApplication[],
  newThreshold: number,
  actorId: string,
  changedAt: string,
): ThresholdResultChange[] {
  return applications.map((a) => {
    const previousResult = a.result;
    const newResult = decide(a.score, newThreshold);
    const changed = previousResult !== newResult;
    return {
      id: a.id,
      cvScore: a.score,
      oldResult: previousResult,
      newResult,
      changed,
      reason: changed ? `Recruiter threshold update to ${newThreshold} (by ${actorId} @ ${changedAt})` : "",
    };
  });
}
