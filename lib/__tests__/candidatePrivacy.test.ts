import { describe, expect, it } from "vitest";
import { candidateCanSeeScore, candidateSafeNotification } from "../candidatePrivacy";

describe("candidate privacy", () => {
  it("shows only automatic public score stages", () => {
    expect(candidateCanSeeScore("CV_SCREENING")).toBe(true);
    expect(candidateCanSeeScore("CCAT")).toBe(true);
    expect(candidateCanSeeScore("MTT")).toBe(true);
    expect(candidateCanSeeScore("GAMES")).toBe(false);
    expect(candidateCanSeeScore("PROMPT")).toBe(false);
    expect(candidateCanSeeScore("ENGLISH_SPEAKING")).toBe(false);
  });

  it("removes restricted scores from historical notifications", () => {
    expect(candidateSafeNotification("Your GAMES result is FAIL (20/100).")).not.toContain("20/100");
    expect(candidateSafeNotification("Your ESSAY was graded: 75/100.")).not.toContain("75/100");
    expect(candidateSafeNotification("Your CCAT result is PASS (80/100).")).toContain("80/100");
  });
});
