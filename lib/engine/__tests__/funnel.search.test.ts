import { describe, it, expect } from "vitest";
import {
  evaluateStageOutcome,
  routeStage,
  type Funnel,
  type FunnelStage,
} from "../funnel";
import {
  filterCandidates,
  sortCandidates,
  paginate,
  toCsv,
  type CandidateRecord,
} from "../search";

function stage(p: Partial<FunnelStage>): FunnelStage {
  return {
    id: p.id ?? "s1",
    type: p.type ?? "CCAT",
    name: p.name ?? "Stage",
    order: p.order ?? 1,
    gradingMode: p.gradingMode,
    passScore: p.passScore,
    passAction: p.passAction,
    failAction: p.failAction,
    passTargetStageId: p.passTargetStageId,
    failTargetStageId: p.failTargetStageId,
  };
}

describe("Funnel stage outcome + routing", () => {
  const funnel: Funnel = {
    id: "f1",
    driveId: "d1",
    version: 1,
    published: true,
    stages: [
      stage({ id: "a", type: "CV_SCREENING", order: 1 }),
      stage({ id: "b", type: "CCAT", order: 2, passScore: 55, passAction: "NEXT", failAction: "REJECT" }),
      stage({ id: "c", type: "CODING", order: 3, passAction: "OFFER" }),
    ],
  };

  it("evaluates pass/fail against passScore", () => {
    expect(evaluateStageOutcome(funnel.stages[1], 70)).toBe("PASS");
    expect(evaluateStageOutcome(funnel.stages[1], 40)).toBe("FAIL");
  });

  it("routes PASS to next stage", () => {
    const r = routeStage(funnel, "b", "PASS");
    expect(r.outcome).toBe("PASS");
    expect(r.nextStageId).toBe("c");
  });

  it("routes FAIL to REJECT (terminal)", () => {
    const r = routeStage(funnel, "b", "FAIL");
    expect(r.finalDecision).toBe("FAIL");
  });

  it("routes final OFFER on last manual stage", () => {
    const r = routeStage(funnel, "c", "PASS");
    expect(r.finalDecision).toBe("PASS");
  });

  it("SKIP moves to next stage", () => {
    const r = routeStage(funnel, "b", "SKIP");
    expect(r.nextStageId).toBe("c");
  });

  it("supports ADVANCE_TO / MOVE_TO custom targets", () => {
    const f: Funnel = {
      ...funnel,
      stages: [
        stage({ id: "x", type: "CCAT", order: 1, passScore: 55, passAction: "ADVANCE_TO", passTargetStageId: "z", failAction: "MOVE_TO", failTargetStageId: "y" }),
        stage({ id: "y", type: "MANUAL_REVIEW", order: 2 }),
        stage({ id: "z", type: "ONSITE", order: 3 }),
      ],
    };
    expect(routeStage(f, "x", "PASS").nextStageId).toBe("z");
    expect(routeStage(f, "x", "FAIL").nextStageId).toBe("y");
  });
});

describe("Candidate search & filters", () => {
  const recs: CandidateRecord[] = [
    {
      id: "1",
      applicationId: "APP-001",
      name: "Alice",
      email: "alice@x.com",
      phone: "123",
      driveId: "d1",
      driveName: "AI Engineer",
      status: "IN_PROGRESS",
      currentStage: "CCAT",
      university: "LUMS",
      degree: "Computer Science",
      gradYear: 2026,
      gpa: 3.7,
      cvScore: 82,
      ccat: 70,
      mtt: 60,
      gameStatus: "PASS" as unknown as string,
      manualReviewStatus: "PENDING" as unknown as string,
      onsiteRsvp: "PENDING",
      finalDecision: "PENDING" as unknown as string,
      integrityFlag: false,
      appliedAt: "2026-08-01",
    },
    {
      id: "2",
      applicationId: "APP-002",
      name: "Bob",
      email: "bob@x.com",
      phone: "456",
      driveId: "d2",
      driveName: "Data Scientist",
      status: "REJECTED",
      currentStage: "CV_SCREENING",
      university: "Unknown U",
      degree: "Physics",
      gradYear: 2024,
      gpa: 2.4,
      cvScore: 40,
      integrityFlag: true,
      appliedAt: "2026-08-10",
    },
  ];

  it("filters by drive", () => {
    expect(filterCandidates(recs, { driveId: "d1" })).toHaveLength(1);
  });
  it("text search across name/email/phone/appId/drive", () => {
    expect(filterCandidates(recs, { search: "APP-002" })).toHaveLength(1);
    expect(filterCandidates(recs, { search: "bob" })).toHaveLength(1);
    expect(filterCandidates(recs, { search: "AI Engineer" })).toHaveLength(1);
  });
  it("filters by university tier list and gpa range", () => {
    expect(filterCandidates(recs, { university: ["LUMS"] })).toHaveLength(1);
    expect(filterCandidates(recs, { gpaMin: 3.5 })).toHaveLength(1);
    expect(filterCandidates(recs, { gpaMax: 2.5 })).toHaveLength(1);
  });
  it("filters by score ranges", () => {
    expect(filterCandidates(recs, { cvMin: 80 })).toHaveLength(1);
    expect(filterCandidates(recs, { ccatMin: 65 })).toHaveLength(1);
  });
  it("filters by integrity flag and final decision", () => {
    expect(filterCandidates(recs, { integrityFlag: true })).toHaveLength(1);
    expect(filterCandidates(recs, { finalDecision: ["PENDING" as unknown as never] })).toHaveLength(1);
  });
  it("sorts and paginates over the full dataset", () => {
    const sorted = sortCandidates(recs, "gpa", "desc");
    expect(sorted[0].name).toBe("Alice");
    const page = paginate(recs, 1, 1);
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
  });
  it("exports CSV", () => {
    const csv = toCsv(recs, ["applicationId", "name", "cvScore"]);
    expect(csv.split("\n")[0]).toBe('"applicationId","name","cvScore"');
    expect(csv.split("\n")).toHaveLength(3);
  });
});
