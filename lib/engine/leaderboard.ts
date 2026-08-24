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
}

// Weighted final score (TCI) for every application in a drive.
// Components come from each application's score map keyed by stage type,
// using the drive's tciWeights (falling back to TCI_DEFAULT_WEIGHTS).
export function buildLeaderboard(
  drive: Drive,
  applications: (Application & { candidate: User })[],
): LeaderboardRow[] {
  const weights = { ...TCI_DEFAULT_WEIGHTS, ...(uj<Record<string, number>>(drive.tciWeights) || {}) };
  const stageTypes = Object.keys(weights).filter((k) => (weights[k] ?? 0) > 0);
  const stageLabel: Record<string, string> = {
    CV_SCREENING: "CV", CCAT: "CCAT", MTT: "MTT", CODING: "Coding", ESSAY: "Essay",
    PROMPT: "Prompt", GAMES: "Games", RAT: "RAT", MANUAL_REVIEW: "Review", ONSITE: "Onsite",
  };

  return applications
    .map((app) => {
      const scores = uj<Record<string, number>>(app.scores) || {};
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
        total: computeTci(components),
        hasScores: hasScores && app.status !== "DRAFT",
      } as LeaderboardRow;
    })
    .sort((a, b) => b.total - a.total || a.candidateName.localeCompare(b.candidateName));
}
