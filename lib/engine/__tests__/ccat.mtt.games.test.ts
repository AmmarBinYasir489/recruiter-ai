import { describe, it, expect } from "vitest";
import { scoreCcat, decideCcat, CCAT_TOTAL, CCAT_DEFAULT_THRESHOLD } from "../ccat";
import {
  scoreMtt,
  decideMtt,
  MTT_TOTAL,
  MTT_DEFAULT_THRESHOLD,
  type MttAnswer,
} from "../mtt";
import { scoreGame, gameAverageToTci, decideGame } from "../games";

describe("CCAT", () => {
  it("each question is 1.25%", () => {
    expect(scoreCcat(40)).toBe(50);
    expect(scoreCcat(80)).toBe(100);
    expect(scoreCcat(0)).toBe(0);
  });
  it("respects default 55% pass threshold", () => {
    expect(decideCcat(scoreCcat(44))).toBe("PASS"); // 55%
    expect(decideCcat(scoreCcat(43))).toBe("FAIL"); // 53.75%
  });
  it("total is 80 questions", () => {
    expect(CCAT_TOTAL).toBe(80);
    expect(CCAT_DEFAULT_THRESHOLD).toBe(55);
  });
});

describe("MTT (negative marking)", () => {
  it("scores correct, wrong (-1) and unanswered (0)", () => {
    const answers: MttAnswer[] = [
      "correct", // q1 -> +3
      "wrong", // q2 -> -1
      "unanswered", // q3 -> 0
      "correct", // q4 -> +3
    ];
    // first 10 worth 3 each
    const { raw, percentage } = scoreMtt(answers);
    expect(raw).toBe(3 - 1 + 0 + 3);
    expect(percentage).toBe(Math.round((5 / MTT_TOTAL) * 100));
  });

  it("uses higher point values for later questions", () => {
    // 30 correct answers: 10*3 + 10*4 + 10*5 = 120
    const all: MttAnswer[] = Array(30).fill("correct");
    expect(scoreMtt(all).raw).toBe(120);
    expect(scoreMtt(all).percentage).toBe(100);
  });

  it("wrong answers subtract 1 even on high-value questions", () => {
    const all: MttAnswer[] = Array(30).fill("wrong");
    expect(scoreMtt(all).raw).toBe(-30); // floored to 0 in percentage reporting
    expect(scoreMtt(all).percentage).toBe(0);
  });

  it("default pass threshold 55%", () => {
    expect(decideMtt(66)).toBe("PASS");
    expect(decideMtt(50)).toBe("FAIL");
    expect(MTT_DEFAULT_THRESHOLD).toBe(55);
  });
});

describe("Games", () => {
  it("only Medium difficulty is officially scored", () => {
    expect(scoreGame(100, 100, "EASY")).toBe(0);
    expect(scoreGame(100, 100, "MEDIUM")).toBe(10);
  });
  it("weights accuracy 70% speed 30%", () => {
    expect(scoreGame(100, 0, "MEDIUM")).toBe(7);
    expect(scoreGame(0, 100, "MEDIUM")).toBe(3);
  });
  it("converts 0-10 average to 0-100 TCI input", () => {
    expect(gameAverageToTci(7.5)).toBe(75);
  });
  it("passes at >=5 by default", () => {
    expect(decideGame(6)).toBe("PASS");
    expect(decideGame(4)).toBe("FAIL");
  });
});
