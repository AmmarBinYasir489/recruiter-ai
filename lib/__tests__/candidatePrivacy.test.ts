import { describe, expect, it } from "vitest";
import { candidateCanSeeScore, candidateSafeNotification } from "../candidatePrivacy";

describe("candidate privacy", () => {
  it("never exposes numeric scores to candidates", () => {
    expect(candidateCanSeeScore("CV_SCREENING")).toBe(false);
    expect(candidateCanSeeScore("CCAT")).toBe(false);
    expect(candidateCanSeeScore("MTT")).toBe(false);
    expect(candidateCanSeeScore("GAMES")).toBe(false);
    expect(candidateCanSeeScore("PROMPT")).toBe(false);
    expect(candidateCanSeeScore("ENGLISH_SPEAKING")).toBe(false);
  });

  it("removes scores but keeps pass/fail decisions from historical notifications", () => {
    expect(candidateSafeNotification("Your GAMES result is FAIL (20/100).")).not.toContain("20/100");
    expect(candidateSafeNotification("Your ESSAY was graded: 75/100.")).not.toContain("75/100");
    expect(candidateSafeNotification("Your CCAT result is PASS (80/100).")).toBe("Your CCAT result is PASS.");
  });
});
