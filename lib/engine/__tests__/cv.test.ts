import { describe, it, expect } from "vitest";
import {
  cvComponents,
  computeCvScore,
  evaluateCv,
  scoreSkills,
  explainCv,
  degreeRelevance,
  CV_RUBRIC,
} from "../cv";

describe("CV skills scoring", () => {
  it("scores required skills heavier than preferred", () => {
    const s = scoreSkills(
      ["python", "react"],
      ["docker"],
      ["python", "react", "docker"],
    );
    expect(s.score).toBe(100);
    expect(s.missing).toHaveLength(0);
  });

  it("penalises missing required skills", () => {
    const s = scoreSkills(["python", "react"], ["docker"], ["python"]);
    // required 1/2 = 0.5*0.7 = .35; preferred 0/1 = 0*0.3 = 0 -> 35
    expect(s.score).toBe(35);
    expect(s.missing).toContain("react");
  });

  it("empty required/preferred means fully satisfied", () => {
    expect(scoreSkills([], [], []).score).toBe(100);
  });
});

describe("CV component build", () => {
  it("uses CGPA band, university tier and degree relevance", () => {
    const c = cvComponents({
      cgpa: 3.6,
      university: "IBA Karachi", // Tier 2 => 100
      degree: "Computer Science",
      requiredSkills: ["python"],
      preferredSkills: [],
      candidateSkills: ["python"],
      projects: 80,
      experience: 70,
      other: 60,
    });
    expect(c.academics).toBe(100);
    expect(c.universityDegree).toBe(Math.round((100 + 100) / 2)); // tier100 + deg100
    expect(c.skills).toBe(100);
  });

  it("degree relevance boosts unrelated vs relevant", () => {
    expect(degreeRelevance("Computer Science")).toBe(100);
    expect(degreeRelevance("Mechanical Engineering")).toBeLessThan(100);
  });

  it("weights sum to 100", () => {
    const sum = Object.values(CV_RUBRIC).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });
});

describe("CV score + threshold", () => {
  it("computes a weighted 0-100 score", () => {
    const comp = {
      academics: 100,
      universityDegree: 100,
      skills: 80,
      projects: 90,
      experience: 70,
      other: 60,
    };
    const score = computeCvScore(comp);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("single threshold: >= threshold => PASS", () => {
    expect(evaluateCv(82, 70)).toBe("PASS");
    expect(evaluateCv(65, 70)).toBe("FAIL");
    expect(evaluateCv(70, 70)).toBe("PASS");
  });

  it("explains the decision", () => {
    const comp = {
      academics: 100,
      universityDegree: 100,
      skills: 80,
      projects: 90,
      experience: 70,
      other: 60,
    };
    const txt = explainCv(comp, computeCvScore(comp), 60);
    expect(txt).toMatch(/CV scored/);
  });
});
