import { describe, it, expect } from "vitest";
import {
  enabledStages,
  nextEnabledStage,
  phaseThreshold,
  findStage,
  automaticStageTransition,
  firstAssessmentStage,
  type Funnel,
  type FunnelStage,
} from "../funnel";
import {
  previewPhaseThreshold,
  applyPhaseThreshold,
  type PhaseApplication,
} from "../cvThreshold";

function stage(p: Partial<FunnelStage>): FunnelStage {
  return { id: p.id || "st-" + String(p.type), name: p.name || String(p.type), order: p.order ?? 1, type: p.type!, passScore: p.passScore!, enabled: p.enabled, passAction: p.passAction || "NEXT", failAction: p.failAction || "REJECT" };
}

function funnel(stages: FunnelStage[], id = "f1"): Funnel {
  return { id, driveId: "d1", version: 1, published: true, stages };
}

describe("funnel configuration", () => {
  it("excludes disabled phases from the journey", () => {
    const f = funnel([
      stage({ type: "CV_SCREENING", passScore: 60, order: 1 }),
      stage({ type: "CODING", passScore: 65, order: 2, enabled: false }),
      stage({ type: "CCAT", passScore: 55, order: 3 }),
    ]);
    const active = enabledStages(f).map((s) => s.type);
    expect(active).toEqual(["CV_SCREENING", "CCAT"]);
    expect(active).not.toContain("CODING");
  });

  it("nextEnabledStage skips disabled phases", () => {
    const f = funnel([
      stage({ type: "CV_SCREENING", order: 1 }),
      stage({ type: "CODING", order: 2, enabled: false }),
      stage({ type: "CCAT", order: 3 }),
    ]);
    const nx = nextEnabledStage(f, { type: "CV_SCREENING" });
    expect(nx?.type).toBe("CCAT");
  });

  it("releases the first post-CV assessment only after staff assigns a funnel", () => {
    const f = funnel([
      stage({ type: "CV_SCREENING", order: 1 }),
      stage({ type: "CODING", order: 2, enabled: false }),
      stage({ type: "CCAT", order: 3 }),
      stage({ type: "FINAL", order: 4 }),
    ]);
    expect(firstAssessmentStage(f)?.type).toBe("CCAT");
  });

  it("supports custom funnels that omit the already-completed CV stage", () => {
    const f = funnel([stage({ type: "MTT", order: 1 }), stage({ type: "FINAL", order: 2 })]);
    expect(firstAssessmentStage(f)?.type).toBe("MTT");
  });

  it("per-phase thresholds are independent", () => {
    const f = funnel([
      stage({ type: "CV_SCREENING", passScore: 60, order: 1 }),
      stage({ type: "CCAT", passScore: 55, order: 2 }),
      stage({ type: "CODING", passScore: 70, order: 3 }),
    ]);
    expect(phaseThreshold(f, "CV_SCREENING")).toBe(60);
    expect(phaseThreshold(f, "CCAT")).toBe(55);
    expect(phaseThreshold(f, "CODING")).toBe(70);
  });

  it("two funnels with different thresholds are isolated", () => {
    const fa = funnel([stage({ type: "CV_SCREENING", passScore: 60, order: 1 })], "fa");
    const fb = funnel([stage({ type: "CV_SCREENING", passScore: 70, order: 1 })], "fb");
    const item: PhaseApplication = { id: "a1", score: 65, result: "FAIL" };
    const pa = previewPhaseThreshold(phaseThreshold(fa, "CV_SCREENING"), 60, [item]);
    const pb = previewPhaseThreshold(phaseThreshold(fb, "CV_SCREENING"), 70, [item]);
    expect(pa.details[0].newResult).toBe("PASS"); // 65 >= 60
    expect(pb.details[0].newResult).toBe("FAIL"); // 65 < 70
  });

  it("automatically releases the next enabled phase after a pass", () => {
    const f = funnel([
      stage({ type: "CCAT", order: 1, passAction: "NEXT" }),
      stage({ type: "CODING", order: 2, enabled: false }),
      stage({ type: "MTT", order: 3 }),
    ]);
    expect(automaticStageTransition(f, "CCAT", "PASS")).toEqual({
      applicationStatus: "IN_PROGRESS",
      currentStage: "MTT",
      phaseReleased: true,
      nextStageName: "MTT",
    });
  });

  it("automatically applies fail routing without releasing a test", () => {
    const f = funnel([stage({ type: "MTT", order: 1, failAction: "REJECT" })]);
    expect(automaticStageTransition(f, "MTT", "FAIL")).toEqual({
      applicationStatus: "REJECTED",
      currentStage: "MTT",
      phaseReleased: false,
    });
  });
});

describe("phase threshold preview/apply (read-only vs applied)", () => {
  const apps: PhaseApplication[] = [
    { id: "x1", score: 82, result: "PASS" },
    { id: "x2", score: 65, result: "PASS" },
    { id: "x3", score: 55, result: "FAIL" },
    { id: "x4", score: 40, result: "FAIL" },
  ];

  it("preview is read-only and reports impact", () => {
    const snapshot = JSON.parse(JSON.stringify(apps));
    const p = previewPhaseThreshold(60, 70, apps);
    expect(p.eligible).toBe(4);
    expect(p.passToFail).toBe(1); // x2 65: PASS -> FAIL
    expect(p.failToPass).toBe(0);
    expect(p.unchanged).toBe(3);
    // inputs must be untouched
    expect(apps).toEqual(snapshot);
  });

  it("apply flags only actual changes (no false positives)", () => {
    const changes = applyPhaseThreshold(apps, 70, "recruiter1", new Date().toISOString());
    const x2 = changes.find((c) => c.id === "x2")!;
    const x1 = changes.find((c) => c.id === "x1")!;
    const x3 = changes.find((c) => c.id === "x3")!;
    expect(x2.changed).toBe(true);
    expect(x2.newResult).toBe("FAIL");
    expect(x1.changed).toBe(false); // 82 still PASS
    expect(x3.changed).toBe(false); // 55 still FAIL
  });

  it("raise threshold filters higher-score candidates (PASS -> FAIL)", () => {
    const changes = applyPhaseThreshold(apps, 75, "r", "t");
    const passing = changes.filter((c) => c.newResult === "PASS").map((c) => c.id);
    expect(passing).toEqual(["x1"]); // only 82 passes >= 75
  });

  it("lower threshold lets more candidates pass (FAIL -> PASS)", () => {
    const changes = applyPhaseThreshold(apps, 50, "r", "t");
    const failing = changes.filter((c) => c.newResult === "FAIL").map((c) => c.id);
    expect(failing).toEqual(["x4"]); // only the 40-score candidate still fails at 50
    const x3 = changes.find((c) => c.id === "x3")!;
    expect(x3.changed).toBe(true);
    expect(x3.newResult).toBe("PASS"); // 55 -> PASS at 50
  });
});
