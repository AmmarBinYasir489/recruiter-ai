import { scoresForMode } from "@/lib/scoreModes";
import type { Drive, Application, User } from "@prisma/client";
import { computeTci, TCI_DEFAULT_WEIGHTS } from "./tci";
import type { TciComponent } from "./types";
import { uj } from "@/lib/db";

export interface LeaderboardRow {
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  currentStage: string | null;
  scores: Record<string, number>;
  weights: Record<string, number>;
  total: number;
  hasScores: boolean;
  complete: boolean;
  gradedCount: number;
  assessmentCount: number;
}

export function computeApplicationTotal(scoresValue: unknown, weightsValue: unknown, enabledTypes?: string[]): { total: number; complete: boolean; gradedCount: number; assessmentCount: number } {
  const readMap = (value: unknown): Record<string, number> => {
    if (value && typeof value === "object") return value as Record<string, number>;
    return uj<Record<string, number>>(typeof value === "string" ? value : null) || {};
  };
  const weights = { ...TCI_DEFAULT_WEIGHTS, ...readMap(weightsValue) };
  const scores = readMap(scoresValue);
  const stageTypes = Object.keys(weights).filter((type) => Number(weights[type]) > 0 && (!enabledTypes || enabledTypes.includes(type)));
  const components = stageTypes.map((type) => ({
    type: type as TciComponent["type"],
    label: type,
    score: scores[type] != null && Number.isFinite(Number(scores[type])) ? Number(scores[type]) : 0,
    weight: Number(weights[type]),
    enabled: true,
  }));
  return {
    total: computeTci(components),
    gradedCount: stageTypes.filter((type) => scores[type] != null && Number.isFinite(Number(scores[type]))).length,
    assessmentCount: stageTypes.length,
    complete: stageTypes.length > 0 && stageTypes.every((type) => scores[type] != null && Number.isFinite(Number(scores[type]))),
  };
}

// Weighted final score (TCI) for every application in a drive.
// Components come from each application's score map keyed by stage type,
// using the drive's tciWeights (falling back to TCI_DEFAULT_WEIGHTS).
export function buildLeaderboard(
  drive: Drive,
  applications: (Application & { candidate: User; results?: any[] })[],
  enabledTypes?: string[],
): LeaderboardRow[] {
  const weights = { ...TCI_DEFAULT_WEIGHTS, ...(uj<Record<string, number>>(drive.tciWeights) || {}) };
  const stageTypes = Object.keys(weights).filter((k) => (weights[k] ?? 0) > 0 && (!enabledTypes || enabledTypes.includes(k)));
  const stageLabel: Record<string, string> = {
    CV_SCREENING: "CV", CCAT: "CCAT", MTT: "MTT", CODING: "Coding", ESSAY: "Essay",
    PROMPT: "Prompt", GAMES: "Games", RAT: "RAT", MANUAL_REVIEW: "Review", ONSITE: "Onsite",
  };

  return applications
    .map((app) => {
      const scores = scoresForMode(app.scores, app.results || [], app.trackKey.startsWith("ONSITE:") ? "ONSITE" : "ONLINE");
      const overall = computeApplicationTotal(scores, drive.tciWeights, enabledTypes);
      let hasScores = false;
      const components = stageTypes.map((type) => {
        const raw = Number(scores[type] ?? 0);
        const score = Number.isNaN(raw) ? 0 : raw;
        if (scores[type] != null && !Number.isNaN(raw)) hasScores = true;
        return { type: type as TciComponent["type"], label: stageLabel[type] || type, score, weight: weights[type], enabled: true };
      });
      return {
        applicationId: app.id,
        candidateName: app.candidate.name || app.candidate.email,
        candidateEmail: app.candidate.email,
        status: app.status,
        currentStage: app.currentStage,
        scores: stageTypes.reduce<Record<string, number>>((m, t) => ((m[t] = scores[t] ?? 0), m), {}),
        weights,
        total: overall.total,
        complete: overall.complete,
        gradedCount: overall.gradedCount,
        assessmentCount: overall.assessmentCount,
        hasScores: hasScores && app.status !== "DRAFT",
      } as LeaderboardRow;
    })
    .sort((a, b) => b.total - a.total || a.candidateName.localeCompare(b.candidateName));
}
