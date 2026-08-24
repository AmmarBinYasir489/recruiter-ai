// Ported from recruitment-portal-v2/src/lib/assessment_integrity.ts.
// Framework-agnostic proctoring/integrity model. Client captures events; this
// module derives an HONEST | SUSPICIOUS | PLAGIARIST level from them so the
// server is the single source of truth (never trust a client-sent label).

export type AssessmentIntegrityLevel = "HONEST" | "SUSPICIOUS" | "PLAGIARIST";

export const ASSESSMENT_INTEGRITY_LABELS: Record<AssessmentIntegrityLevel, string> = {
  HONEST: "Honest",
  SUSPICIOUS: "Suspicious",
  PLAGIARIST: "Plagiarist",
};

export type AssessmentIntegrityEvent = {
  eventType: string;
  timestamp?: Date | string | null;
};

export type AssessmentIntegrityCounts = {
  tabSwitches: number;
  fullscreenExits: number;
  fullscreenEnters: number;
  copyAttempts: number;
  pasteAttempts: number;
  rightClicks: number;
  timeOutsideFullscreenSeconds: number;
};

export type AssessmentIntegritySummary = {
  level: AssessmentIntegrityLevel;
  label: string;
  counts: AssessmentIntegrityCounts;
  reasons: string[];
};

export function formatAssessmentDurationSeconds(secondsInput: number | null | undefined): string {
  const seconds = Math.max(0, Math.round(Number(secondsInput) || 0));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;
}

type TimedEvent = { eventType: string; timestampMs: number };

function toTimestampMs(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function timedEvents(events: AssessmentIntegrityEvent[]): TimedEvent[] {
  return events
    .map((event) => {
      const timestampMs = toTimestampMs(event.timestamp);
      return timestampMs === null ? null : { eventType: event.eventType, timestampMs };
    })
    .filter((event): event is TimedEvent => Boolean(event))
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

export function computeTimeOutsideFullscreenSeconds(
  events: AssessmentIntegrityEvent[],
  endAt?: Date | string | null
): number {
  const ordered = timedEvents(events);
  const endMs = toTimestampMs(endAt);
  let totalMs = 0;
  let exitMs: number | null = null;

  for (const event of ordered) {
    if (event.eventType === "FULLSCREEN_EXIT") {
      exitMs = event.timestampMs;
    } else if (event.eventType === "FULLSCREEN_ENTER" && exitMs !== null) {
      totalMs += Math.max(0, event.timestampMs - exitMs);
      exitMs = null;
    }
  }

  if (exitMs !== null && endMs !== null) {
    totalMs += Math.max(0, endMs - exitMs);
  }

  return Math.max(0, Math.round(totalMs / 1000));
}

export function summarizeAssessmentIntegrity(
  eventsInput: AssessmentIntegrityEvent[] | null | undefined,
  endAt?: Date | string | null
): AssessmentIntegritySummary {
  const events = eventsInput ?? [];
  const counts: AssessmentIntegrityCounts = {
    tabSwitches: events.filter((event) => event.eventType === "TAB_SWITCH").length,
    fullscreenExits: events.filter((event) => event.eventType === "FULLSCREEN_EXIT").length,
    fullscreenEnters: events.filter((event) => event.eventType === "FULLSCREEN_ENTER").length,
    copyAttempts: events.filter((event) => event.eventType === "COPY").length,
    pasteAttempts: events.filter((event) => event.eventType === "PASTE").length,
    rightClicks: events.filter((event) => event.eventType === "RIGHT_CLICK").length,
    timeOutsideFullscreenSeconds: computeTimeOutsideFullscreenSeconds(events, endAt),
  };

  const copyPasteAttempts = counts.copyAttempts + counts.pasteAttempts;
  const plagiaristReasons: string[] = [];
  const suspiciousReasons: string[] = [];

  if (counts.tabSwitches > 4) plagiaristReasons.push(`${counts.tabSwitches} tab switches`);
  else if (counts.tabSwitches >= 2) suspiciousReasons.push(`${counts.tabSwitches} tab switches`);

  if (copyPasteAttempts >= 3) plagiaristReasons.push(`${copyPasteAttempts} copy/paste attempts`);
  else if (copyPasteAttempts > 0)
    suspiciousReasons.push(`${copyPasteAttempts} copy/paste attempt${copyPasteAttempts === 1 ? "" : "s"}`);

  if (counts.fullscreenExits >= 5) plagiaristReasons.push(`${counts.fullscreenExits} fullscreen exits`);
  else if (counts.fullscreenExits >= 2) suspiciousReasons.push(`${counts.fullscreenExits} fullscreen exits`);

  const outsideFullscreenCopy = formatAssessmentDurationSeconds(counts.timeOutsideFullscreenSeconds);
  if (counts.timeOutsideFullscreenSeconds > 120) plagiaristReasons.push(`${outsideFullscreenCopy} outside fullscreen`);
  else if (counts.timeOutsideFullscreenSeconds > 30) suspiciousReasons.push(`${outsideFullscreenCopy} outside fullscreen`);

  const level: AssessmentIntegrityLevel =
    plagiaristReasons.length > 0 ? "PLAGIARIST" : suspiciousReasons.length > 0 ? "SUSPICIOUS" : "HONEST";

  return {
    level,
    label: ASSESSMENT_INTEGRITY_LABELS[level],
    counts,
    reasons: level === "PLAGIARIST" ? plagiaristReasons : suspiciousReasons,
  };
}
