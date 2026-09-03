import { uj } from "@/lib/db";

type Result = { type: string; mode?: string | null; normalized: number; status: string; gradedAt?: unknown; createdAt?: Date | string };
// Reconstruct mode-specific scores from attempts; a comparison retest must not
// overwrite the online total (or mix online and onsite scores).
export function scoresForMode(base: unknown, results: Result[], mode: string): Record<string, number> {
  const scores = typeof base === "string" ? { ...(uj<Record<string, number>>(base) || {}) } : { ...(base as Record<string, number> || {}) };
  const types = new Set(results.map((r) => r.type));
  for (const type of types) {
    const result = results.filter((r) => r.type === type && (r.mode || "ONLINE") === mode)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
    if (!result || (result.status === "MANUAL_REVIEW" && !result.gradedAt)) delete scores[type];
    else scores[type] = result.normalized;
  }
  return scores;
}
