import { describe, it, expect } from "vitest";
import {
  scoreEssayByRubric,
  essayRawToPercent,
  ESSAY_RUBRIC,
  ESSAY_BANK_MAX,
} from "../essay";
import {
  scoreCodingByRubric,
  codingRawToPercent,
  CODING_RUBRIC,
  CODING_DEFAULT_MAX,
} from "../coding";
import {
  scorePromptByRubric,
  promptRawToPercent,
  PROMPT_RUBRIC,
  PROMPT_DEFAULT_MAX,
} from "../prompt";
import { computeTci, TCI_DEFAULT_WEIGHTS } from "../tci";

describe("Essay rubric", () => {
  it("weights sum to 100", () => {
    expect(Object.values(ESSAY_RUBRIC).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("computes a weighted score", () => {
    const s = scoreEssayByRubric({
      understanding: 80,
      communication: 70,
      criticalThinking: 60,
      problemSolving: 90,
      domainKnowledge: 50,
    });
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(100);
  });
  it("converts raw points to percent (bank max 130)", () => {
    expect(essayRawToPercent(130)).toBe(100);
    expect(essayRawToPercent(65)).toBe(50);
    expect(ESSAY_BANK_MAX).toBe(130);
  });
});

describe("Coding rubric", () => {
  it("weights sum to 100", () => {
    expect(Object.values(CODING_RUBRIC).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("computes weighted score and raw->percent (default max 40)", () => {
    const s = scoreCodingByRubric({
      correctness: 90,
      codeQuality: 80,
      logic: 70,
      efficiency: 60,
      bestPractices: 50,
    });
    expect(s).toBeGreaterThan(0);
    expect(codingRawToPercent(40)).toBe(100);
    expect(CODING_DEFAULT_MAX).toBe(40);
  });
});

describe("Prompt rubric", () => {
  it("weights sum to 100", () => {
    expect(Object.values(PROMPT_RUBRIC).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("computes weighted score and raw->percent (default max 60)", () => {
    const s = scorePromptByRubric({
      promptDesign: 80,
      clarity: 70,
      structure: 60,
      reasoning: 90,
      outcome: 50,
    });
    expect(s).toBeGreaterThan(0);
    expect(promptRawToPercent(60)).toBe(100);
    expect(PROMPT_DEFAULT_MAX).toBe(60);
  });
});

describe("TCI", () => {
  it("default weights sum to 100", () => {
    expect(Object.values(TCI_DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("computes weighted average of enabled components", () => {
    const tci = computeTci([
      { type: "CV_SCREENING", label: "CV", score: 80, enabled: true, weight: 10 },
      { type: "CCAT", label: "CCAT", score: 70, enabled: true, weight: 15 },
      { type: "CODING", label: "Coding", score: 90, enabled: true, weight: 25 },
    ]);
    // (80*10 + 70*15 + 90*25) / 50 = (800+1050+2250)/50 = 82
    expect(tci).toBe(82);
  });
  it("normalizes weights when not summing to 100 and ignores disabled", () => {
    const tci = computeTci([
      { type: "CV_SCREENING", label: "CV", score: 100, enabled: false, weight: 10 },
      { type: "CCAT", label: "CCAT", score: 50, enabled: true, weight: 1 },
      { type: "CODING", label: "Coding", score: 80, enabled: true, weight: 3 },
    ]);
    // only CCAT+CODING: (50*1 + 80*3)/4 = 290/4 = 72.5 -> 73
    expect(tci).toBe(73);
  });
});
