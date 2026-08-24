import type { Decision } from "./types";

// Games: Accuracy 70%, Speed bonus 30%. Single game result 0-10.
// Only Medium-difficulty results are officially scored. The official game
// average (0-10) is converted to 0-100 before contributing to TCI (*10).

export type GameDifficulty = "EASY" | "MEDIUM" | "HARD";

export function scoreGame(accuracyPct: number, speedScore0to100: number, difficulty: GameDifficulty = "MEDIUM"): number {
  if (difficulty !== "MEDIUM") return 0; // only Medium is officially scored
  const accuracy = Math.max(0, Math.min(100, accuracyPct));
  const speed = Math.max(0, Math.min(100, speedScore0to100));
  const result0to10 = ((accuracy * 0.7 + speed * 0.3) / 100) * 10;
  return Math.round(result0to10 * 10) / 10; // 0-10 with one decimal
}

// Convert the official game average (0-10) to a 0-100 TCI input.
export function gameAverageToTci(average0to10: number): number {
  return Math.round(average0to10 * 10);
}

export function decideGame(result0to10: number, passAt = 5): Decision {
  return result0to10 >= passAt ? "PASS" : "FAIL";
}
