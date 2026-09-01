import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const { authState } = vi.hoisted(() => ({ authState: { user: null as any } }));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => Promise.resolve(authState.user),
  requireRole: () => Promise.resolve(authState.user),
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    const e: any = new Error("NEXT_REDIRECT:" + to);
    e.__redirect = true;
    throw e;
  },
}));

import { prisma, j } from "@/lib/db";
import { applyAction, submitAutoTestAction, startAssessmentAction, getAssessmentAttemptAction } from "@/app/candidate/actions";
import { processDueCvJobs } from "@/lib/cv/worker";
import { signCvToken, verifyCvToken, authorizeCvAccess } from "@/lib/cv/access";
import {
  createFunnelAction,
  editFunnelStructureAction,
  previewPhaseThresholdAction,
  applyPhaseThresholdAction,
  issueNextPhaseAction,
  requestRetestAction,
  manualPassAction,
  advanceApplicationAction,
  assignCandidateFunnelAction,
} from "@/app/recruiter/actions";
import { gradeAssessmentAction } from "@/app/reviewer/actions";
import { summarizeAssessmentIntegrity } from "@/lib/integrity";
import { resultForCurrentStage } from "@/lib/candidateStage";

async function act<T>(p: Promise<T>): Promise<T | { __redirected: true }> {
  try {
    return await p;
  } catch (e: any) {
    if (e && e.__redirect) return { __redirected: true } as any;
    throw e;
  }
}

function fd(entries: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v as any);
  return f;
}
const fakeFile = (name: string, text: string, type = "text/plain") =>
  new File([Buffer.from(text)], name, { type });

const ctx: any = {};

beforeAll(async () => {
  await prisma.application.deleteMany();
  await prisma.assessmentResult.deleteMany();
  await prisma.assessmentAttempt.deleteMany();
  await prisma.funnel.deleteMany();
  await prisma.drive.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.thresholdChange.deleteMany();
  await prisma.cvJob.deleteMany();
  await prisma.auditLog.deleteMany();

  const upsert = (id: string, email: string, role: string) =>
    prisma.user.upsert({ where: { email }, update: {}, create: { id, email, name: id, passwordHash: "x", role } });
  await upsert("qa-rec", "qa-recruiter@portal.com", "recruiter");
  await upsert("qa-rev", "qa-reviewer@portal.com", "reviewer");
  for (let i = 1; i <= 12; i++) await upsert("c" + i, "c" + i + "@portal.com", "candidate");

  const baseDrive = { jobDescription: "jd", location: "Remote", deadline: new Date(Date.now() + 86400000), publicLink: "x", status: "OPEN", cvPassThreshold: 60, tciWeights: "{}", rubricConfig: "{}", thresholdHistory: "[]", ownerId: "qa-rec" };
  ctx.driveA = await prisma.drive.create({
    data: { ...baseDrive, name: "QA Drive A", jobDescription: "Need python and machine learning. University LUMS." },
  });
  ctx.funnelA = await prisma.funnel.create({
    data: {
      driveId: ctx.driveA.id, name: "Funnel A", version: 1, published: true,
      stages: j([
        { id: "s1", order: 1, type: "CV_SCREENING", enabled: true, passScore: 60, durationMin: 0, gradingMode: "AUTO", passAction: "NEXT", failAction: "REJECT" },
        { id: "s2", order: 2, type: "CCAT", enabled: true, passScore: 55, durationMin: 20, gradingMode: "AUTO", passAction: "NEXT", failAction: "REJECT" },
        { id: "s3", order: 3, type: "CODING", enabled: true, passScore: 65, durationMin: 30, gradingMode: "MANUAL", assignedReviewers: ["qa-rev"], passAction: "NEXT", failAction: "REJECT" },
      ]),
    },
  });
  ctx.driveB = await prisma.drive.create({ data: { ...baseDrive, name: "QA Drive B", jobDescription: "stats", cvPassThreshold: 50 } });
  ctx.funnelB = await prisma.funnel.create({
    data: { driveId: ctx.driveB.id, name: "Funnel B", version: 1, published: true, stages: j([{ id: "b1", order: 1, type: "CV_SCREENING", enabled: true, passScore: 70, durationMin: 0, gradingMode: "AUTO", passAction: "NEXT", failAction: "REJECT" }]) },
  });
});

afterAll(async () => {
  const driveIds = [ctx.driveA?.id, ctx.driveB?.id].filter(Boolean);
  const qaUserIds = ["qa-rec", "qa-rev", "c-track", ...Array.from({ length: 12 }, (_, index) => `c${index + 1}`)];
  await prisma.auditLog.deleteMany({ where: { actorId: { in: qaUserIds } } });
  await prisma.thresholdChange.deleteMany({ where: { driveId: { in: driveIds } } });
  await prisma.application.deleteMany({ where: { driveId: { in: driveIds } } });
  await prisma.drive.updateMany({ where: { id: { in: driveIds } }, data: { defaultFunnelId: null } });
  await prisma.drive.deleteMany({ where: { id: { in: driveIds } } });
  await prisma.user.deleteMany({ where: { id: { in: qaUserIds } } });
  await prisma.$disconnect();
});

describe("1. Apply + async CV processing + gating + duplicate", () => {
  it("uploads CV, enqueues CvJob, then worker scores it (async pipeline)", async () => {
    authState.user = { id: "c1", role: "candidate" };
    const evidencedCv = `C1\nLUMS university\nComputer Science\nGPA: 4.0/4.0\n\nSkills\nPython, machine learning, data structures\n\nExperience\nMachine Learning Engineer | Acme | 2021 - 2025\nBuilt and deployed fraud detection models in Python.\n\nProjects\nFraud Detection Model\nProduction machine learning classifier built with Python.`;
    const res = await act(applyAction(ctx.driveA.id, fd({ funnelId: ctx.funnelA.id, cvFile: fakeFile("cv.txt", evidencedCv), fullName: "C1", email: "c1@portal.com" })));
    expect(res).toEqual({ __redirected: true } as any);
    const app = await prisma.application.findFirst({ where: { candidateId: "c1", driveId: ctx.driveA.id } });
    expect(app).toBeTruthy();
    expect(app!.funnelId).toBeNull();
    // Immediately after apply the CV is queued, not yet scored.
    expect(app!.cvResult).toBe("PROCESSING");
    expect(app!.phaseReleased).toBe(false);
    const queued = await prisma.cvJob.findFirst({ where: { applicationId: app!.id } });
    expect(queued!.status).toBe("QUEUED");
    expect(queued!.storagePath).toContain(app!.id);

    // Drain the queue; worker extracts, scores, applies the DRIVE threshold,
    // and leaves every applicant on hold until staff selects a funnel.
    await processDueCvJobs();
    let job = queued!;
    for (let i = 0; i < 30 && job.status === "QUEUED"; i++) {
      await new Promise((r) => setTimeout(r, 500));
      job = (await prisma.cvJob.findFirst({ where: { applicationId: app!.id } }))!;
    }
    expect(job.status).toBe("COMPLETED");
    expect((job.extractedText ?? "").length).toBeGreaterThan(0);
    const scored = await prisma.application.findUnique({ where: { id: app!.id } })!;
    expect(scored!.cvResult).toBe("PASS");
    expect(scored!.currentStage).toBe("CV_SCREENING");
    expect(scored!.phaseReleased).toBe(false);
    expect(scored!.status).toBe("HOLD");

    // Funnel selection is staff-only and happens after CV screening. This
    // deliberate action releases the funnel's first real assessment.
    authState.user = { id: "qa-rec", role: "recruiter" };
    const assigned = await assignCandidateFunnelAction(app!.id, fd({ funnelId: ctx.funnelA.id }));
    expect((assigned as any).ok).toBe(true);
    const released = await prisma.application.findUnique({ where: { id: app!.id } });
    expect(released!.currentStage).toBe("CCAT");
    expect(released!.phaseReleased).toBe(true);
  });

  it("unsupported file type does not crash (heuristic fallback)", async () => {
    authState.user = { id: "c2", role: "candidate" };
    const res = await act(applyAction(ctx.driveA.id, fd({ funnelId: ctx.funnelA.id, cvFile: fakeFile("cv.xyz", "random bytes"), fullName: "C2", email: "c2@portal.com" })));
    expect(res).toEqual({ __redirected: true } as any);
    expect(await prisma.application.findFirst({ where: { candidateId: "c2" } })).toBeTruthy();
  });

  it("duplicate application rejected (single row)", async () => {
    authState.user = { id: "c1", role: "candidate" };
    const before = await prisma.application.count({ where: { candidateId: "c1", driveId: ctx.driveA.id } });
    const res = await act(applyAction(ctx.driveA.id, fd({ funnelId: ctx.funnelA.id, cvFile: fakeFile("cv.txt", "x"), fullName: "C1", email: "c1@portal.com" })));
    const after = await prisma.application.count({ where: { candidateId: "c1", driveId: ctx.driveA.id } });
    expect(after).toBe(before);
    expect((res as any)?.error).toBeTruthy();
  });
});

describe("7. Server-authoritative assessment lifecycle (P1)", () => {
  it("submit without starting is rejected; start then submit succeeds; refresh recovers attempt", async () => {
    const app = await prisma.application.create({ data: { candidateId: "c9", driveId: ctx.driveA.id, funnelId: ctx.funnelA.id, funnelVersion: ctx.funnelA.version, cvResult: "PASS", currentStage: "CCAT", phaseReleased: true, status: "IN_PROGRESS" } });
    authState.user = { id: "c9", role: "candidate" };

    // No active attempt yet -> submit blocked.
    const q = await prisma.question.findFirst({ where: { bank: "CCAT" } });
    const form = new FormData();
    form.append("a" + q!.number, "0");
    const blocked = await act(submitAutoTestAction(app.id, "CCAT", form));
    expect((blocked as any)?.error).toBeTruthy();

    // Start -> active attempt (server deadline from funnel durationMin=20).
    const started = await startAssessmentAction(app.id, "CCAT");
    expect((started as any).ok).toBe(true);
    const recovered = await getAssessmentAttemptAction(app.id, "CCAT");
    expect(recovered).toBeTruthy();
    expect(recovered!.attemptNumber).toBe(1);
    expect(recovered!.deadlineAt).toBeTruthy();

    // Now submit (correct answer) -> success + result created + attempt SUBMITTED.
    const correct = (JSON.parse((await prisma.question.findUnique({ where: { id: q!.id } }))!.content as string)).correctAnswerIndex;
    const good = new FormData();
    good.append("a" + q!.number, String(correct));
    const ok = await act(submitAutoTestAction(app.id, "CCAT", good));
    expect(ok).toEqual({ __redirected: true } as any);
    expect(await prisma.assessmentResult.count({ where: { applicationId: app.id, type: "CCAT" } })).toBe(1);
    const attempt = await prisma.assessmentAttempt.findFirst({ where: { applicationId: app.id, type: "CCAT" } });
    expect(attempt!.status).toBe("SUBMITTED");

    // Duplicate-final-result: cannot restart an already-submitted assessment.
    const restart = await startAssessmentAction(app.id, "CCAT");
    expect((restart as any)?.error).toBeTruthy();
  });

  it("late submission after server deadline is rejected", async () => {
    const app = await prisma.application.create({ data: { candidateId: "c7", driveId: ctx.driveA.id, funnelId: ctx.funnelA.id, funnelVersion: ctx.funnelA.version, cvResult: "PASS", currentStage: "CCAT", phaseReleased: true, status: "IN_PROGRESS" } });
    authState.user = { id: "c7", role: "candidate" };
    const started = await startAssessmentAction(app.id, "CCAT");
    expect((started as any).ok).toBe(true);
    // Force the deadline into the past.
    const att = await prisma.assessmentAttempt.findFirst({ where: { applicationId: app.id, type: "CCAT", status: "ACTIVE" } });
    await prisma.assessmentAttempt.update({ where: { id: att!.id }, data: { deadlineAt: new Date(Date.now() - 1000) } });

    const q = await prisma.question.findFirst({ where: { bank: "CCAT" } });
    const form = new FormData();
    form.append("a" + q!.number, "0");
    const late = await act(submitAutoTestAction(app.id, "CCAT", form));
    expect((late as any)?.error).toBeTruthy();
    // Attempt marked expired, no result created.
    const after = await prisma.assessmentAttempt.findFirst({ where: { applicationId: app.id, type: "CCAT" } });
    expect(after!.status).toBe("EXPIRED");
    expect(await prisma.assessmentResult.count({ where: { applicationId: app.id, type: "CCAT" } })).toBe(0);
  });
});

describe("8. Secure CV access (P3)", () => {
  it("token is valid only for its application + user and expires", async () => {
    const tok = signCvToken("app-1", "u-1", 60);
    expect(verifyCvToken(tok, "app-1", "u-1")).toBe(true);
    expect(verifyCvToken(tok, "app-2", "u-1")).toBe(false);
    expect(verifyCvToken(tok, "app-1", "u-2")).toBe(false);
    const expired = signCvToken("app-1", "u-1", -1);
    expect(verifyCvToken(expired, "app-1", "u-1")).toBe(false);
  });

  it("role authorization: candidate own only, recruiter drive owner only", async () => {
    const app = await prisma.application.create({ data: { candidateId: "c3", driveId: ctx.driveA.id, funnelId: ctx.funnelA.id, funnelVersion: ctx.funnelA.version, currentStage: "CV_SCREENING", phaseReleased: false, status: "IN_PROGRESS" } });
    const withDrive = await prisma.application.findUnique({ where: { id: app.id }, include: { drive: true } })!;
    expect(await authorizeCvAccess({ id: "c3", role: "CANDIDATE" }, withDrive!)).toBe(true);
    expect(await authorizeCvAccess({ id: "c4", role: "CANDIDATE" }, withDrive!)).toBe(false);
    expect(await authorizeCvAccess({ id: "qa-rec", role: "RECRUITER" }, withDrive!)).toBe(true);
    expect(await authorizeCvAccess({ id: "qa-rec2", role: "RECRUITER" }, withDrive!)).toBe(false);
    expect(await authorizeCvAccess({ id: "admin-1", role: "ADMIN" }, withDrive!)).toBe(true);
  });
});

describe("2. Per-phase threshold preview/apply, re-eval, notifications, isolation", () => {
  let apps: any;
  beforeAll(async () => {
    await prisma.application.deleteMany();
    await prisma.assessmentResult.deleteMany();
    await prisma.cvJob.deleteMany();
    await prisma.notification.deleteMany();
    const mk = async (cid: string, score: number, result: string) => {
      const app = await prisma.application.create({ data: { candidateId: cid, driveId: ctx.driveA.id, funnelId: ctx.funnelA.id, funnelVersion: ctx.funnelA.version, cvScore: score, cvResult: result, currentStage: "CV_SCREENING", phaseReleased: false, status: result === "PASS" ? "IN_PROGRESS" : "HOLD" } });
      await prisma.notification.create({ data: { userId: cid, type: "CV_RESULT", message: "init", read: true, relatedAppId: app.id } });
      return app;
    };
    apps = {};
    apps.high = await mk("c3", 82, "PASS");
    apps.mid = await mk("c4", 65, "PASS");
    apps.low = await mk("c5", 55, "FAIL");
    apps.b = await prisma.application.create({ data: { candidateId: "c6", driveId: ctx.driveB.id, funnelId: ctx.funnelB.id, funnelVersion: ctx.funnelB.version, cvScore: 65, cvResult: "PASS", currentStage: "CV_SCREENING", phaseReleased: false, status: "IN_PROGRESS" } });
    await prisma.notification.create({ data: { userId: "c6", type: "CV_RESULT", message: "initB", read: true, relatedAppId: apps.b.id } });
  });

  it("marks automatic threshold changes as future-only", async () => {
    authState.user = { id: "qa-rec", role: "recruiter" };
    const p = (await previewPhaseThresholdAction(ctx.funnelA.id, "CV_SCREENING", 70))!;
    expect(p).toBeTruthy();
    expect(p.futureOnly).toBe(true);
    expect(p.eligible).toBe(0);
    expect(p.passToFail).toBe(0);
    expect(p.failToPass).toBe(0);
    expect(p.unchanged).toBe(0);
    expect((await prisma.application.findUnique({ where: { id: apps.mid.id } }))!.cvResult).toBe("PASS");
  });

  it("applies automatic thresholds to future submissions without rewriting progressed candidates", async () => {
    authState.user = { id: "qa-rec", role: "recruiter" };
    const before = await prisma.notification.count({ where: { userId: "c4" } });
    const r = await act(applyPhaseThresholdAction(ctx.funnelA.id, "CV_SCREENING", 70, 60));
    expect(r).toEqual({ __redirected: true } as any);
    expect((await prisma.application.findUnique({ where: { id: apps.mid.id } }))!.cvResult).toBe("PASS");
    expect((await prisma.application.findUnique({ where: { id: apps.high.id } }))!.cvResult).toBe("PASS");
    const lowRec = await prisma.application.findUnique({ where: { id: apps.low.id } });
    expect(lowRec!.cvResult).toBe("FAIL");
    expect(await prisma.notification.count({ where: { userId: "c4" } })).toBe(before);
    const tc = await prisma.thresholdChange.findFirst({ where: { funnelId: ctx.funnelA.id, phaseType: "CV_SCREENING" }, orderBy: { createdAt: "desc" } });
    expect(tc!.passToFail).toBe(0);
    expect(tc!.affected).toBe(0);
  });

  it("funnel isolation: funnelA change does not touch funnelB", async () => {
    authState.user = { id: "qa-rec", role: "recruiter" };
    const beforeB = await prisma.notification.count({ where: { userId: "c6", relatedAppId: apps.b.id } });
    await act(applyPhaseThresholdAction(ctx.funnelA.id, "CV_SCREENING", 75, 70));
    expect((await prisma.application.findUnique({ where: { id: apps.b.id } }))!.cvResult).toBe("PASS");
    expect(await prisma.notification.count({ where: { userId: "c6", relatedAppId: apps.b.id } })).toBe(beforeB);
  });

  it("optimistic concurrency: wrong snapshot rejected", async () => {
    authState.user = { id: "qa-rec", role: "recruiter" };
    const midBefore = (await prisma.application.findUnique({ where: { id: apps.mid.id } }))!.cvResult;
    const r = await applyPhaseThresholdAction(ctx.funnelA.id, "CV_SCREENING", 90, 60); // current is 75
    expect((r as any).error).toBeTruthy();
    expect((await prisma.application.findUnique({ where: { id: apps.mid.id } }))!.cvResult).toBe(midBefore);
  });

  it("per-phase independence: CCAT threshold change does not touch CV", async () => {
    authState.user = { id: "qa-rec", role: "recruiter" };
    await prisma.assessmentResult.create({ data: { applicationId: apps.high.id, type: "CCAT", status: "PASS", normalized: 78, answers: "[]" } });
    const p = (await previewPhaseThresholdAction(ctx.funnelA.id, "CCAT", 90))!;
    expect(p.futureOnly).toBe(true);
    expect(p.eligible).toBe(0);
    expect(p.passToFail).toBe(0);
    await act(applyPhaseThresholdAction(ctx.funnelA.id, "CCAT", 90, 55));
    const ccRes = await prisma.assessmentResult.findFirst({ where: { applicationId: apps.high.id, type: "CCAT" } });
    const cvr = await prisma.application.findUnique({ where: { id: apps.high.id } });
    expect(ccRes!.status).toBe("PASS");
    expect(cvr!.cvResult).toBe("PASS");
  });
});

describe("3. Gated phase release", () => {
  let apps: any;
  beforeAll(async () => {
    apps = {
      high: await prisma.application.findFirst({ where: { candidateId: "c3" } }),
      mid: await prisma.application.findFirst({ where: { candidateId: "c4" } }),
      low: await prisma.application.findFirst({ where: { candidateId: "c5" } }),
    };
  });
  it("does not allow manual issuance for an automatic phase", async () => {
    authState.user = { id: "qa-rec", role: "recruiter" };
    const nHigh = await prisma.notification.count({ where: { userId: "c3" } });
    const r = await act(issueNextPhaseAction(ctx.funnelA.id, "CV_SCREENING", [], "passing"));
    expect((r as any).error).toMatch(/automatically/i);
    const high = await prisma.application.findUnique({ where: { id: apps.high.id } });
    expect(high!.phaseReleased).toBe(false);
    expect(high!.currentStage).toBe("CV_SCREENING");
    expect((await prisma.application.findUnique({ where: { id: apps.mid.id } }))!.phaseReleased).toBe(false);
    expect((await prisma.application.findUnique({ where: { id: apps.low.id } }))!.phaseReleased).toBe(false);
    expect(await prisma.notification.count({ where: { userId: "c3" } })).toBe(nHigh);
  });
  it("candidate cannot submit unreleased/locked phase", async () => {
    authState.user = { id: "c4", role: "candidate" };
    const q = await prisma.question.findFirst({ where: { bank: "CCAT" } });
    const form = new FormData();
    form.append("a" + q!.number, "0");
    const res = await act(submitAutoTestAction(apps.mid.id, "CCAT", form));
    expect((res as any)?.error).toBeTruthy();
  });

  it("opens the next enabled phase, notifies once, and never shows the previous result as current", async () => {
    authState.user = { id: "qa-rec", role: "recruiter" };
    const funnel = await prisma.funnel.create({
      data: {
        driveId: ctx.driveA.id,
        name: "Release regression funnel",
        version: 1,
        published: true,
        stages: j([
          { id: "release-coding", order: 1, type: "CODING", enabled: true, gradingMode: "MANUAL", passScore: 60 },
          { id: "release-disabled", order: 2, type: "ESSAY", enabled: false, gradingMode: "MANUAL" },
          { id: "release-prompt", order: 3, type: "PROMPT", enabled: true, gradingMode: "MANUAL" },
        ]),
      },
    });
    const application = await prisma.application.create({
      data: {
        candidateId: "c8",
        driveId: ctx.driveA.id,
        funnelId: funnel.id,
        funnelVersion: 1,
        currentStage: "CODING",
        phaseReleased: false,
        status: "IN_PROGRESS",
      },
    });
    const oldResult = await prisma.assessmentResult.create({
      data: { applicationId: application.id, type: "CODING", normalized: 82, status: "PASS", answers: "[]" },
    });

    const released = await issueNextPhaseAction(funnel.id, "CODING", [application.id], "selected");
    expect(released).toEqual({ ok: true, count: 1 });

    const updated = await prisma.application.findUnique({
      where: { id: application.id },
      include: { results: { orderBy: { createdAt: "desc" } } },
    });
    expect(updated!.currentStage).toBe("PROMPT");
    expect(updated!.phaseReleased).toBe(true);
    expect(resultForCurrentStage(updated!.results, updated!.currentStage!)).toBeUndefined();
    expect(updated!.results[0].id).toBe(oldResult.id);

    const notices = await prisma.notification.findMany({
      where: { userId: "c8", relatedAppId: application.id, type: "PHASE_RELEASED" },
    });
    expect(notices).toHaveLength(1);
    expect(notices[0].message).toMatch(/Prompt/i);

    const staleRepeat = await issueNextPhaseAction(funnel.id, "CODING", [application.id], "selected");
    expect(staleRepeat).toEqual({ ok: true, count: 0 });
    expect(await prisma.notification.count({ where: { userId: "c8", relatedAppId: application.id, type: "PHASE_RELEASED" } })).toBe(1);
    expect((await prisma.application.findUnique({ where: { id: application.id } }))!.currentStage).toBe("PROMPT");
  });
});

describe("4. Reviewer grading does not auto-advance", () => {
  it("grading CODING keeps currentStage gated", async () => {
    const app = await prisma.application.create({ data: { candidateId: "c7", driveId: ctx.driveA.id, funnelId: ctx.funnelA.id, funnelVersion: ctx.funnelA.version, currentStage: "CODING", phaseReleased: false, status: "IN_PROGRESS" } });
    const res = await prisma.assessmentResult.create({ data: { applicationId: app.id, type: "CODING", status: "MANUAL_REVIEW", normalized: 70, answers: "[]" } });
    authState.user = { id: "qa-rev", role: "reviewer" };
    const form = new FormData();
    form.append("correctness", "85");
    form.append("codeQuality", "80");
    form.append("logic", "85");
    form.append("efficiency", "80");
    form.append("bestPractices", "80");
    form.append("feedback", "good");
    const r = await act(gradeAssessmentAction(res.id, form));
    expect((r as any).__redirected || (r as any).ok).toBeTruthy();
    expect((await prisma.assessmentResult.findUnique({ where: { id: res.id } }))!.status).toBe("PENDING");
    const after = await prisma.application.findUnique({ where: { id: app.id } });
    expect(after!.currentStage).toBe("CODING");
    expect(after!.phaseReleased).toBe(false);
  });
});

describe("5. Funnel versioning + name persistence", () => {
  it("createFunnelAction persists the funnel name", async () => {
    authState.user = { id: "qa-rec", role: "recruiter" };
    const r = await act(createFunnelAction(ctx.driveB.id, fd({ name: "Named Funnel", stages: JSON.stringify([{ type: "CV_SCREENING", passScore: 50, enabled: true, gradingMode: "AUTO" }]) })));
    expect((r as any).ok || (r as any).__redirected).toBeTruthy();
    const f = await prisma.funnel.findFirst({ where: { name: "Named Funnel" } });
    expect(f).toBeTruthy();
  });
  it("structural edit with applications creates a new version; old apps keep version", async () => {
    authState.user = { id: "qa-rec", role: "recruiter" };
    const oldId = ctx.funnelA.id;
    const oldVer = ctx.funnelA.version;
    const app = await prisma.application.findFirst({ where: { funnelId: oldId } })!;
    const r = await act(editFunnelStructureAction(oldId, fd({ stages: JSON.stringify([{ id: "s1", type: "CV_SCREENING", passScore: 60, enabled: true, gradingMode: "AUTO" }, { id: "s2", type: "CCAT", passScore: 55, enabled: false, gradingMode: "AUTO" }, { id: "s3", type: "CODING", passScore: 65, enabled: true, gradingMode: "MANUAL" }]) })));
    expect((r as any).versioned).toBe(true);
    const funnels = await prisma.funnel.findMany({ where: { driveId: ctx.driveA.id } });
    expect(funnels.length).toBeGreaterThanOrEqual(2);
    const still = await prisma.application.findUnique({ where: { id: app!.id } });
    expect(still!.funnelId).toBe(oldId);
    expect(still!.funnelVersion).toBe(oldVer);
  });
});

describe("6. Duplicate submission protection", () => {
  it("double CCAT submit creates only one final result", async () => {
    const app = await prisma.application.create({ data: { candidateId: "c12", driveId: ctx.driveA.id, funnelId: ctx.funnelA.id, funnelVersion: ctx.funnelA.version, cvResult: "PASS", currentStage: "CCAT", phaseReleased: true, status: "IN_PROGRESS" } });
    authState.user = { id: "c12", role: "candidate" };
    await startAssessmentAction(app.id, "CCAT");
    const q = await prisma.question.findFirst({ where: { bank: "CCAT" } });
    const correct = (JSON.parse((await prisma.question.findUnique({ where: { id: q!.id } }))!.content as string)).correctAnswerIndex;
    const form = new FormData();
    form.append("a" + q!.number, String(correct));
    await act(submitAutoTestAction(app.id, "CCAT", form));
    await act(submitAutoTestAction(app.id, "CCAT", form));
    expect(await prisma.assessmentResult.count({ where: { applicationId: app.id, type: "CCAT" } })).toBe(1);
  });
});

describe("7b. Independent multi-funnel tracks", () => {
  it("creates a second track without overwriting the candidate's first funnel progress", async () => {
    await prisma.user.upsert({
      where: { email: "track-candidate@portal.com" },
      update: {},
      create: { id: "c-track", email: "track-candidate@portal.com", name: "Track Candidate", passwordHash: "x", role: "candidate" },
    });
    const secondFunnel = await prisma.funnel.create({
      data: {
        driveId: ctx.driveA.id,
        name: "Funnel B for same drive",
        version: 1,
        published: true,
        stages: j([
          { id: "track-cv", order: 1, type: "CV_SCREENING", enabled: true, passScore: 60, durationMin: 0, gradingMode: "AUTO", passAction: "NEXT", failAction: "HOLD" },
          { id: "track-mtt", order: 2, type: "MTT", enabled: true, passScore: 55, durationMin: 20, gradingMode: "AUTO", passAction: "NEXT", failAction: "HOLD" },
          { id: "track-final", order: 3, type: "FINAL", enabled: true, passScore: 0, durationMin: 0, gradingMode: "MANUAL", passAction: "HOLD", failAction: "HOLD" },
        ]),
      },
    });
    const original = await prisma.application.create({
      data: {
        candidateId: "c-track",
        driveId: ctx.driveA.id,
        funnelId: ctx.funnelA.id,
        funnelVersion: ctx.funnelA.version,
        cvScore: 77,
        cvResult: "PASS",
        currentStage: "CODING",
        phaseReleased: true,
        status: "IN_PROGRESS",
        scores: j({ CV_SCREENING: 77, CCAT: 68 }),
        stageHistory: j([{ stage: "CCAT", status: "PASS", at: new Date().toISOString() }]),
        appliedAt: new Date(),
      },
    });
    await prisma.assessmentResult.create({
      data: { applicationId: original.id, type: "CCAT", rawScore: 68, maxScore: 100, normalized: 68, status: "PASS" },
    });

    authState.user = { id: "qa-rec", role: "recruiter" };
    const assigned = await assignCandidateFunnelAction(original.id, fd({ funnelId: secondFunnel.id }));
    expect((assigned as any).ok).toBe(true);
    expect((assigned as any).createdTrack).toBe(true);
    expect((assigned as any).applicationId).not.toBe(original.id);

    const unchanged = await prisma.application.findUnique({ where: { id: original.id }, include: { results: true } });
    expect(unchanged!.funnelId).toBe(ctx.funnelA.id);
    expect(unchanged!.currentStage).toBe("CODING");
    expect(unchanged!.results).toHaveLength(1);

    const newTrack = await prisma.application.findUnique({ where: { id: (assigned as any).applicationId }, include: { results: true } });
    expect(newTrack!.sourceApplicationId).toBe(original.id);
    expect(newTrack!.funnelId).toBe(secondFunnel.id);
    expect(newTrack!.currentStage).toBe("MTT");
    expect(newTrack!.phaseReleased).toBe(true);
    expect(newTrack!.results).toHaveLength(0);
    expect(JSON.parse(newTrack!.scores)).toEqual({ CV_SCREENING: 77 });

    const duplicate = await assignCandidateFunnelAction(original.id, fd({ funnelId: secondFunnel.id }));
    expect((duplicate as any).error).toContain("already has a separate track");
    expect(await prisma.application.count({ where: { candidateId: "c-track", driveId: ctx.driveA.id } })).toBe(2);

    const skipped = await advanceApplicationAction(newTrack!.id);
    expect((skipped as any).ok).toBe(true);
    expect(await prisma.application.findUnique({ where: { id: newTrack!.id } })).toMatchObject({ currentStage: "FINAL", status: "HOLD" });

    const moveFunnel = await prisma.funnel.create({
      data: {
        driveId: ctx.driveA.id,
        name: "Replacement funnel",
        version: 1,
        published: true,
        stages: j([
          { id: "move-cv", order: 1, type: "CV_SCREENING", enabled: true, passScore: 60, durationMin: 0, gradingMode: "AUTO", passAction: "NEXT", failAction: "HOLD" },
          { id: "move-essay", order: 2, type: "ESSAY", enabled: true, passScore: 55, durationMin: 20, gradingMode: "MANUAL", passAction: "NEXT", failAction: "HOLD" },
          { id: "move-final", order: 3, type: "FINAL", enabled: true, passScore: 0, durationMin: 0, gradingMode: "MANUAL", passAction: "HOLD", failAction: "HOLD" },
        ]),
      },
    });
    await prisma.assessmentAttempt.create({ data: { applicationId: original.id, type: "CODING", status: "READY", attemptNumber: 1 } });
    const moved = await assignCandidateFunnelAction(original.id, fd({ funnelId: moveFunnel.id, assignmentMode: "MOVE" }));
    expect(moved).toMatchObject({ ok: true, movedTrack: true });
    expect(await prisma.application.findUnique({ where: { id: original.id } })).toMatchObject({ status: "ARCHIVED", phaseReleased: false });
    expect(await prisma.assessmentAttempt.findFirst({ where: { applicationId: original.id, type: "CODING" } })).toMatchObject({ status: "CANCELLED" });

    const movedTrackId = (moved as any).applicationId as string;
    expect(await prisma.application.findUnique({ where: { id: movedTrackId } })).toMatchObject({ funnelId: moveFunnel.id, currentStage: "ESSAY", status: "IN_PROGRESS" });
    await prisma.assessmentResult.create({ data: { applicationId: movedTrackId, type: "ESSAY", rawScore: 20, maxScore: 100, normalized: 20, status: "PENDING" } });
    const passed = await manualPassAction(movedTrackId);
    expect((passed as any).ok).toBe(true);
    expect(await prisma.application.findUnique({ where: { id: movedTrackId } })).toMatchObject({ currentStage: "FINAL", status: "HOLD" });
  });
});

describe("9. Retest (re-issue), manual pass override, integrity summary", () => {
  it("summarizeAssessmentIntegrity derives HONEST / SUSPICIOUS / PLAGIARIST", () => {
    const honest = summarizeAssessmentIntegrity([]);
    expect(honest.level).toBe("HONEST");

    const suspicious = summarizeAssessmentIntegrity([
      { eventType: "TAB_SWITCH", timestamp: new Date() },
      { eventType: "TAB_SWITCH", timestamp: new Date() },
    ]);
    expect(suspicious.level).toBe("SUSPICIOUS");
    expect(suspicious.reasons.length).toBeGreaterThan(0);

    const plagiarist = summarizeAssessmentIntegrity(
      Array.from({ length: 5 }, () => ({ eventType: "TAB_SWITCH", timestamp: new Date() })),
    );
    expect(plagiarist.level).toBe("PLAGIARIST");
  });

  it("recruiter can re-issue a retest: ready attempt + candidate-started timer + second result stored", async () => {
    const app = await prisma.application.create({
      data: {
        candidateId: "c10", driveId: ctx.driveA.id, funnelId: ctx.funnelA.id, funnelVersion: ctx.funnelA.version,
        cvResult: "PASS", currentStage: "CCAT", phaseReleased: false, status: "IN_PROGRESS",
      },
    });
    await prisma.assessmentResult.create({
      data: { applicationId: app.id, type: "CCAT", mode: "ONLINE", rawScore: 10, maxScore: 20, normalized: 50, status: "FAIL", answers: j({}) },
    });
    authState.user = { id: "qa-rec", role: "recruiter" };
    const issued = await requestRetestAction(app.id, fd({ type: "CCAT", mode: "ONLINE" }));
    expect((issued as any).ok).toBe(true);

    const attempts = await prisma.assessmentAttempt.findMany({ where: { applicationId: app.id, type: "CCAT" }, orderBy: { attemptNumber: "asc" } });
    expect(attempts.length).toBe(1); // the re-issued attempt
    expect(attempts[0].status).toBe("READY");
    expect(attempts[0].startedAt).toBeNull();
    expect(attempts[0].mode).toBe("ONLINE");
    const retestAttemptId = attempts[0].id;

    const reApp = await prisma.application.findUnique({ where: { id: app.id } });
    expect(reApp!.currentStage).toBe("CCAT");
    expect(reApp!.phaseReleased).toBe(true);

    // Candidate retakes and submits -> a second, distinct result is stored.
    authState.user = { id: "c10", role: "candidate" };
    await startAssessmentAction(app.id, "CCAT");
    const q = await prisma.question.findFirst({ where: { bank: "CCAT" } });
    const correct = (JSON.parse((await prisma.question.findUnique({ where: { id: q!.id } }))!.content as string)).correctAnswerIndex;
    const form = new FormData();
    form.append("a" + q!.number, String(correct));
    await act(submitAutoTestAction(app.id, "CCAT", form));

    const results = await prisma.assessmentResult.findMany({ where: { applicationId: app.id, type: "CCAT" } });
    expect(results.length).toBe(2); // original FAIL + new retest result
    expect(results.some((r) => r.attemptId === retestAttemptId)).toBe(true);
    expect(results.every((r) => r.mode === "ONLINE")).toBe(true);
  });

  it("recruiter/admin manual pass overrides a failed stage and advances", async () => {
    const app = await prisma.application.create({
      data: {
        candidateId: "c11", driveId: ctx.driveA.id, funnelId: ctx.funnelA.id, funnelVersion: ctx.funnelA.version,
        cvResult: "PASS", currentStage: "CCAT", phaseReleased: false, status: "IN_PROGRESS", scores: j({}),
      },
    });
    await prisma.assessmentResult.create({
      data: { applicationId: app.id, type: "CCAT", mode: "ONLINE", rawScore: 8, maxScore: 20, normalized: 40, status: "FAIL", answers: j({}), integrityLevel: "HONEST", integrityReasons: j([]) },
    });
    authState.user = { id: "qa-rec", role: "recruiter" };
    const passed = await manualPassAction(app.id);
    expect((passed as any).ok).toBe(true);

    const result = await prisma.assessmentResult.findFirst({ where: { applicationId: app.id, type: "CCAT" } });
    expect(result!.status).toBe("PASS");
    expect(result!.normalized).toBe(40); // manual approval preserves the submitted score
    expect(result!.mode).toBe("ONLINE");
    expect(result!.integrityLevel).toBe("HONEST");

    const updated = await prisma.application.findUnique({ where: { id: app.id } });
    expect(updated!.status).toBe("IN_PROGRESS");
    expect(updated!.currentStage).toBe("CODING"); // next stage after CCAT in funnelA
    expect((JSON.parse(updated!.scores) as Record<string, number>)["CCAT"]).toBe(40);
  });
});
