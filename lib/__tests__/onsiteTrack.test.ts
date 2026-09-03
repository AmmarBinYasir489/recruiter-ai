import { describe, it, expect } from "vitest";
import { isOnsiteTrack, onsiteNext } from "../onsiteTrack";
import type { Funnel } from "../engine/funnel";

describe("onsite session progression", () => {
  const funnel = { stages: ["CV_SCREENING", "CCAT", "MTT", "CODING", "ESSAY", "PROMPT", "ENGLISH_SPEAKING", "GAMES", "ONSITE", "FINAL"].map((type, order) => ({ id: type, type, name: type, order, enabled: true })) } as Funnel;
  it("runs all tests in order, skipping intake and email-only onsite stage", () => {
    let next = onsiteNext(funnel);
    for (const type of ["CCAT", "MTT", "CODING", "ESSAY", "PROMPT", "ENGLISH_SPEAKING", "GAMES"]) {
      expect(next).toMatchObject({ currentStage: type, phaseReleased: true });
      next = onsiteNext(funnel, type);
    }
    expect(next).toMatchObject({ currentStage: "FINAL", phaseReleased: false, applicationStatus: "HOLD" });
  });
  it("honours disabled and scheduled tests", () => {
    const custom = { ...funnel, stages: funnel.stages.map((stage) => ({ ...stage, enabled: stage.type !== "CCAT", opensAt: stage.type === "MTT" ? "2099-01-01" : undefined })) };
    expect(onsiteNext(custom)).toMatchObject({ currentStage: "MTT", phaseReleased: false, applicationStatus: "HOLD" });
    expect(isOnsiteTrack("ONSITE:f1")).toBe(true);
    expect(isOnsiteTrack("f1")).toBe(false);
  });
});
