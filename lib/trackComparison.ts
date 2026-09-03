import { scoresForMode } from "@/lib/scoreModes";
import { computeApplicationTotal } from "@/lib/engine/leaderboard";
import { uj } from "@/lib/db";

type Track = {
  id: string; candidateId: string; driveId: string; funnelId: string | null;
  trackKey: string; status: string; currentStage: string | null; scores: string;
  results: Parameters<typeof scoresForMode>[1];
};

// Compare only one candidate, drive and exact funnel version. A legacy single-test
// retest is a separate source, never merged into a full onsite session.
export function buildTrackComparison(selected: Track, tracks: Track[], weights: unknown, enabled: string[]) {
  if (!selected.funnelId) return [];
  return tracks.filter((track) => track.candidateId === selected.candidateId && track.driveId === selected.driveId && track.funnelId === selected.funnelId)
    .flatMap((track) => {
      const mode = track.trackKey.startsWith("ONSITE:") ? "ONSITE" : "ONLINE";
      const primary = {
        key: `${track.id}:${mode}`, applicationId: track.id, mode,
        source: mode === "ONSITE" ? "Full onsite session" : "Online track",
        currentStage: track.currentStage, archived: track.status === "ARCHIVED",
        selected: track.id === selected.id,
        ...computeApplicationTotal(scoresForMode(track.scores, track.results, mode), weights, enabled),
      };
      const opposite = mode === "ONLINE" ? "ONSITE" : "ONLINE";
      if (!track.results.some((result) => result.mode === opposite)) return [primary];
      const base = uj<Record<string, number>>(track.scores) || {};
      return [primary, {
        key: `${track.id}:${opposite}:retests`, applicationId: track.id, mode: opposite,
        source: `${opposite === "ONSITE" ? "Onsite" : "Online"} retests on ${mode.toLowerCase()} track`,
        currentStage: null, archived: track.status === "ARCHIVED", selected: false,
        ...computeApplicationTotal(scoresForMode({ CV_SCREENING: base.CV_SCREENING }, track.results, opposite), weights, enabled),
      }];
    });
}
