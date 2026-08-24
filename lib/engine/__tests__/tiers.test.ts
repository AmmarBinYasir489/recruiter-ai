import { describe, it, expect } from "vitest";
import {
  universityTier,
  universityScore,
  TIER_SCORE,
  TIER1,
} from "../tiers";
import { cgpaToAcademics, DEFAULT_CGPA } from "../cgpa";

describe("university tiers", () => {
  it("maps tier 1 institutions to score 85", () => {
    expect(universityTier("FAST-NUCES")).toBe(1);
    expect(universityScore("NUST").score).toBe(TIER_SCORE[1]);
  });

  it("maps tier 2 institutions to the highest score (100)", () => {
    expect(universityTier("UET Lahore")).toBe(2);
    expect(universityScore("IBA Karachi").score).toBe(100);
  });

  it("maps tier 3 institutions to score 70", () => {
    expect(universityTier("University of the Punjab")).toBe(3);
    expect(universityScore("Iqra University").score).toBe(70);
  });

  it("tier 2 score is higher than tier 1 per recruitment policy", () => {
    expect(TIER_SCORE[2]).toBeGreaterThan(TIER_SCORE[1]);
  });

  it("returns UNVERIFIED for unknown / empty universities", () => {
    expect(universityTier(undefined)).toBe("UNVERIFIED");
    expect(universityTier("Some Unknown College")).toBe("UNVERIFIED");
    expect(universityScore("Unknown").score).toBe(0);
  });

  it("does a loose contains match (e.g. LUMS)", () => {
    expect(universityTier("Lahore University of Management Sciences (LUMS)")).toBe(1);
  });

  it("tier 1 has exactly 5 institutions", () => {
    expect(TIER1.length).toBe(5);
  });
});

describe("CGPA bands", () => {
  it("3.50+ -> 100", () => {
    expect(cgpaToAcademics(3.8)).toBe(100);
  });
  it("3.00-3.49 -> 70", () => {
    expect(cgpaToAcademics(3.2)).toBe(70);
  });
  it("2.50-2.99 -> 40", () => {
    expect(cgpaToAcademics(2.7)).toBe(40);
  });
  it("below 2.50 -> 10", () => {
    expect(cgpaToAcademics(2.0)).toBe(10);
  });
  it("missing CGPA uses default 2.5 -> 40", () => {
    expect(cgpaToAcademics(undefined)).toBe(cgpaToAcademics(DEFAULT_CGPA));
    expect(cgpaToAcademics()).toBe(40);
  });
});
