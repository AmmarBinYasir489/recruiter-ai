"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma, j, uj, getFunnel } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import {
  managedApplicationIds,
  requireManagedApplication,
  requireManagedDrive,
  requireManagedFunnel,
} from "@/lib/recruiterAccess";
import {
  previewThresholdChange,
  applyThresholdToApplications,
  previewPhaseThreshold,
  applyPhaseThreshold,
  type ThresholdApplication,
  type PhaseApplication,
} from "@/lib/engine/cvThreshold";
import {
  nextEnabledStage,
  phaseThreshold,
  type Funnel,
  type FunnelStage,
  type StageType,
  automaticStageTransition,
} from "@/lib/engine/funnel";

const AUTOMATIC_THRESHOLD_TYPES = new Set(["CV_SCREENING", "CCAT", "MTT"]);
const MANUAL_GRADING_TYPES = new Set(["CODING", "ESSAY", "PROMPT", "RAT", "ENGLISH_SPEAKING"]);

// Routes that display candidate/funnel state. Revalidate them after any mutation
// so the recruiter UI and the candidate-facing page reflect the change immediately.
function revalidateCandidateRoutes() {
  try {
    revalidatePath("/recruiter/candidates");
    revalidatePath("/recruiter/candidates/[id]");
    revalidatePath("/recruiter/drives/[id]");
    revalidatePath("/recruiter/funnel/[id]");
    revalidatePath("/candidate/application/[id]");
  } catch (error) {
    // Server actions have a static-generation store; direct unit calls do not.
    if (!(error instanceof Error) || !error.message.includes("static generation store missing")) throw error;
  }
}

const DEFAULT_STAGES = (reviewerId?: string) => [
  { id: "st-cv", type: "CV_SCREENING", name: "CV Screening", order: 1, passAction: "NEXT", failAction: "REJECT" },
  { id: "st-ccat", type: "CCAT", name: "CCAT / IQ", order: 2, gradingMode: "AUTO", passScore: 55, durationMin: 15, passAction: "NEXT", failAction: "REJECT" },
  { id: "st-mtt", type: "MTT", name: "Math Thinking Test", order: 3, gradingMode: "AUTO", passScore: 55, durationMin: 20, passAction: "NEXT", failAction: "REJECT" },
  { id: "st-coding", type: "CODING", name: "Coding", order: 4, gradingMode: "MANUAL", passScore: 60, durationMin: 45, assignedReviewers: reviewerId ? [reviewerId] : [], passAction: "NEXT", failAction: "HOLD" },
  { id: "st-essay", type: "ESSAY", name: "Essay", order: 5, gradingMode: "MANUAL", assignedReviewers: reviewerId ? [reviewerId] : [], passAction: "NEXT", failAction: "HOLD" },
  { id: "st-prompt", type: "PROMPT", name: "Prompt Engineering", order: 6, gradingMode: "MANUAL", assignedReviewers: reviewerId ? [reviewerId] : [], passAction: "NEXT", failAction: "HOLD" },
  { id: "st-english", type: "ENGLISH_SPEAKING", name: "English Speaking", order: 7, gradingMode: "MANUAL", passScore: 60, durationMin: 5, assignedReviewers: reviewerId ? [reviewerId] : [], passAction: "NEXT", failAction: "HOLD" },
  { id: "st-games", type: "GAMES", name: "Games", order: 8, gradingMode: "AUTO", passAction: "NEXT", failAction: "NEXT" },
  { id: "st-rat", type: "RAT", name: "Research Amplitude Test", order: 9, gradingMode: "MANUAL", passScore: 60, assignedReviewers: reviewerId ? [reviewerId] : [], passAction: "NEXT", failAction: "HOLD" },
  { id: "st-onsite", type: "ONSITE", name: "Onsite", order: 10, passAction: "NEXT", failAction: "REJECT" },
  { id: "st-final", type: "FINAL", name: "Final Decision", order: 11 },
];

export async function assignCandidateFunnelAction(applicationId: string, formData: FormData) {
  const user = await requireRole("recruiter", "admin");
  const app = await requireManagedApplication(user, applicationId);
  const funnelId = String(formData.get("funnelId") || "");
  const funnelRow = await prisma.funnel.findFirst({ where: { id: funnelId, driveId: app.driveId, published: true } });
  if (!funnelRow) return { error: "Select a published funnel for this drive." };
  const nonCvResult = await prisma.assessmentResult.findFirst({ where: { applicationId, type: { not: "CV_SCREENING" } }, select: { id: true } });
  if (nonCvResult) return { error: "The funnel cannot be changed after assessments have started." };
  const funnel = await getFunnel(funnelId);
  if (!funnel) return { error: "Funnel not found." };
  const transition = app.cvResult === "PASS" || app.cvResult === "FAIL"
    ? automaticStageTransition(funnel, "CV_SCREENING", app.cvResult)
    : { applicationStatus: "IN_PROGRESS" as const, currentStage: "CV_SCREENING" as StageType, phaseReleased: false, nextStageName: undefined };
  await prisma.$transaction(async (tx) => {
    await tx.application.update({ where: { id: applicationId }, data: { funnelId, funnelVersion: funnelRow.version, status: transition.applicationStatus, currentStage: transition.currentStage, phaseReleased: transition.phaseReleased } });
    await tx.auditLog.create({ data: { actorId: user.id, action: "FUNNEL_ASSIGNED", meta: j({ applicationId, funnelId, version: funnelRow.version }) } });
    await createNotification({ userId: app.candidateId, type: "APPLICATION_UPDATED", message: transition.nextStageName ? `${transition.nextStageName} is now available.` : "Your application setup has been updated.", relatedAppId: applicationId }, tx);
  });
  revalidateCandidateRoutes();
  return { ok: true };
}

export async function createDriveAction(formData: FormData) {
  const user = await requireRole("recruiter", "admin");
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Name is required." };
  const cvPassThreshold = Math.max(0, Math.min(100, Number(formData.get("cvPassThreshold") || 60)));
  const location = String(formData.get("location") || "");
  const jobDescription = String(formData.get("jobDescription") || "");
  const deadlineRaw = String(formData.get("deadline") || "");
  const deadline = new Date(deadlineRaw);
  if (!deadlineRaw || isNaN(deadline.getTime())) return { error: "A valid deadline is required." };
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (deadline < startOfToday) return { error: "Deadline must be today or a future date." };

  const reviewer = await prisma.user.findFirst({ where: { role: "reviewer" } });

  const drive = await prisma.drive.create({
    data: {
      name,
      jobDescription,
      location,
      deadline,
      publicLink: `/apply/${name.toLowerCase().replace(/\s+/g, "-")}`,
      status: "OPEN",
      cvPassThreshold,
      tciWeights: j({ CV_SCREENING: 10, GAMES: 10, CCAT: 15, MTT: 15, ESSAY: 10, CODING: 25, PROMPT: 15 }),
      rubricConfig: j({ ccat: { threshold: 55 }, mtt: { threshold: 55 } }),
      thresholdHistory: j([]),
      ownerId: user.id,
    },
  });

  await prisma.funnel.create({
    data: { driveId: drive.id, version: 1, published: true, stages: j(DEFAULT_STAGES(reviewer?.id)) },
  });

  await prisma.auditLog.create({
    data: { actorId: user.id, action: "DRIVE_CREATED", meta: j({ driveId: drive.id, name }) },
  });

  redirect(user.role === "admin" ? `/admin/drives/${drive.id}` : `/recruiter/drives/${drive.id}`);
}

// ---- 2-step CV threshold change ----
export async function previewThresholdAction(driveId: string, proposed: number) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedDrive(user, driveId);
  const drive = await prisma.drive.findUnique({ where: { id: driveId } });
  if (!drive) return null;
  const apps = await prisma.application.findMany({
    where: { driveId, cvScore: { not: null } },
    select: { id: true, cvScore: true, cvResult: true },
  });
  const ta: ThresholdApplication[] = apps.map((a) => ({
    id: a.id,
    cvScore: a.cvScore!,
    cvResult: (a.cvResult as any) || "FAIL",
  }));
  return previewThresholdChange(drive.cvPassThreshold, proposed, ta);
}

export async function applyThresholdAction(driveId: string, proposed: number, currentSnapshot: number) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedDrive(user, driveId);
  const drive = await prisma.drive.findUnique({ where: { id: driveId } });
  if (!drive) return { error: "Drive not found." };

  // Optimistic-concurrency guard.
  if (drive.cvPassThreshold !== currentSnapshot) {
    return { error: "The threshold was changed by another recruiter. Please review the latest value before applying." };
  }

  const apps = await prisma.application.findMany({
    where: { driveId, cvScore: { not: null } },
    select: { id: true, cvScore: true, cvResult: true, candidateId: true },
  });
  const ta: ThresholdApplication[] = apps.map((a) => ({
    id: a.id,
    cvScore: a.cvScore!,
    cvResult: (a.cvResult as any) || "FAIL",
  }));

  const changes = applyThresholdToApplications(ta, proposed, user.id, new Date().toISOString());

  // Build updates + notifications inside one transaction.
  await prisma.$transaction(async (tx) => {
    await tx.drive.update({
      where: { id: driveId },
      data: {
        cvPassThreshold: proposed,
        thresholdHistory: j([
          ...(uj<any[]>(drive.thresholdHistory) || []),
          {
            threshold: proposed,
            changedAt: new Date().toISOString(),
            actorId: user.id,
            passToFail: changes.filter((c) => c.changed && c.newResult === "FAIL").length,
            failToPass: changes.filter((c) => c.changed && c.newResult === "PASS").length,
            unchanged: changes.filter((c) => !c.changed).length,
          },
        ]),
      },
    });
    for (const c of changes) {
      if (!c.changed) continue;
      await tx.application.update({
        where: { id: c.id },
        data: { cvResult: c.newResult, status: c.newResult === "PASS" ? "IN_PROGRESS" : "HOLD", phaseReleased: false },
      });
      const app = apps.find((a) => a.id === c.id)!;
      // Notification only when the candidate's actual result changed.
      await tx.notification.create({
        data: {
          userId: app.candidateId,
          type: "CV_THRESHOLD",
          message: `Your CV result was re-evaluated and is now: ${c.newResult} (threshold ${proposed}).`,
          relatedAppId: app.id,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CV_THRESHOLD_CHANGED",
        meta: j({
          driveId,
          oldThreshold: currentSnapshot,
          newThreshold: proposed,
          affected: changes.length,
          passToFail: changes.filter((c) => c.changed && c.newResult === "FAIL").length,
          failToPass: changes.filter((c) => c.changed && c.newResult === "PASS").length,
          unchanged: changes.filter((c) => !c.changed).length,
        }),
      },
    });
  });

  redirect(user.role === "admin" ? `/admin/drives/${driveId}?thresholdApplied=${proposed}` : `/recruiter/drives/${driveId}?thresholdApplied=${proposed}`);
}

// ---- candidate actions ----
export async function advanceApplicationAction(applicationId: string) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedApplication(user, applicationId);
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app) return { error: "Not found." };
  const funnel = app.funnelId ? await getFunnel(app.funnelId) : null;
  if (!funnel) return { error: "No funnel." };
  if (!app.currentStage) return { error: "No current stage." };
  const next = nextEnabledStage(funnel, { type: app.currentStage as StageType });
  if (!next) return { error: "No next enabled stage is configured." };
  const nextName = next.name || next.type;
  const reachingFinal = next.type === "FINAL";
  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: applicationId },
      data: {
        currentStage: next.type,
        phaseReleased: !reachingFinal,
        status: reachingFinal ? "HOLD" : "IN_PROGRESS",
        stageHistory: j([
          ...(uj<any[]>(app.stageHistory) || []),
          { stage: app.currentStage, status: "ADVANCED", at: new Date().toISOString(), note: `Next phase released: ${nextName}` },
        ]),
      },
    });
    await createNotification({
      userId: app.candidateId,
      type: "PHASE_RELEASED",
      message: reachingFinal ? "Your assessments are complete. The final decision is pending." : `Next phase released: ${nextName}.`,
      relatedAppId: applicationId,
    }, tx);
    await tx.auditLog.create({ data: { actorId: user.id, action: "ADVANCE", meta: j({ applicationId, from: app.currentStage, next: next.type }) } });
  });
  revalidateCandidateRoutes();
  return { ok: true };
}

// Recruiter/admin override: pass a failed (or any) stage and move the candidate
// forward. Records a manual PASS result so the score/scores reflect it and the
// funnel advances past the gating check that would otherwise hold them.
export async function manualPassAction(applicationId: string) {
  const user = await requireRole("recruiter", "admin");
  const app = await prisma.application.findUnique({ where: { id: applicationId }, include: { drive: true, funnel: true } });
  if (!app) return { error: "Not found." };
  if (user.role === "recruiter" && app.drive?.ownerId !== user.id) return { error: "Not authorized." };
  const type = app.currentStage;
  if (!type) return { error: "No current stage." };
  const funnel = app.funnelId ? await getFunnel(app.funnelId) : null;
  if (!funnel) return { error: "No funnel." };
  const next = nextEnabledStage(funnel, { type: type as StageType });
  if (!next) return { error: "No next enabled stage is configured." };
  const nextName = next.name || next.type;
  const reachingFinal = next.type === "FINAL";

  const scores = uj<Record<string, number>>(app.scores) || {};
  scores[type] = 100;
  await prisma.$transaction(async (tx) => {
    await tx.assessmentResult.create({
      data: {
        applicationId, type, mode: "ONLINE", rawScore: 100, maxScore: 100,
        normalized: 100, status: "PASS",
        answers: j({ manualPass: true, by: user.id, at: new Date().toISOString() }),
        integrityLevel: "HONEST", integrityReasons: j([]),
      },
    });
    await tx.application.update({
      where: { id: applicationId },
      data: {
        status: reachingFinal ? "HOLD" : "IN_PROGRESS", currentStage: next.type, phaseReleased: !reachingFinal, scores: j(scores),
        stageHistory: j([
          ...(uj<any[]>(app.stageHistory) ?? []),
          { stage: type, status: "PASS", at: new Date().toISOString(), manual: true, note: `Manually passed; next phase released: ${nextName}` },
        ]),
      },
    });
    await createNotification({ userId: app.candidateId, type: "PHASE_RELEASED", message: reachingFinal ? "Your assessments are complete. The final decision is pending." : `Next phase released: ${nextName}.`, relatedAppId: applicationId }, tx);
    await tx.auditLog.create({
      data: { actorId: user.id, action: "MANUAL_PASS", meta: j({ applicationId, stage: type, next: next.type }) },
    });
  });
  revalidateCandidateRoutes();
  return { ok: true };
}

// Recruiter/admin adjusts a (manual-graded) score without losing the original.
// The original value is preserved in the result notes as an audit trail;
// the active/normalized score is updated and the pass/fail is recomputed.
export async function updateResultScoreAction(resultId: string, formData: FormData) {
  const user = await requireRole("recruiter", "admin");
  const result = await prisma.assessmentResult.findUnique({
    where: { id: resultId },
    include: { application: { include: { drive: true, funnel: true } } },
  });
  if (!result) return { error: "Not found." };
  const app = result.application;
  if (user.role === "recruiter" && app.drive?.ownerId !== user.id) return { error: "Not authorized." };

  const newScore = Math.max(0, Math.min(100, Math.round(Number(formData.get("score") || 0))));
  const note = String(formData.get("note") || "");
  const original = result.normalized;
  const newStatus = "PENDING";

  const adjustment = `Score adjusted by ${user.role} ${user.id} on ${new Date().toISOString()}: ${original} → ${newScore}${note ? ` (note: ${note})` : ""}`;
  const existingNotes = result.notes ? result.notes + "\n" : "";

  await prisma.assessmentResult.update({
    where: { id: resultId },
    data: { normalized: newScore, status: newStatus, notes: existingNotes + adjustment },
  });

  const scores = uj<Record<string, number>>(app.scores) || {};
  scores[result.type] = newScore;
  await prisma.application.update({ where: { id: app.id }, data: { scores: j(scores) } });

  await prisma.auditLog.create({
    data: { actorId: user.id, action: "SCORE_ADJUST", meta: j({ resultId, type: result.type, original, newScore }) },
  });
  revalidateCandidateRoutes();
  return { ok: true };
}

export async function rejectApplicationAction(applicationId: string) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedApplication(user, applicationId);
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app) return { error: "Not found." };
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: "REJECTED",
      stageHistory: j([
        ...(uj<any[]>(app.stageHistory) || []),
        { stage: app.currentStage, status: "FAIL", at: new Date().toISOString(), note: "Rejected by recruiter" },
      ]),
    },
  });
  await createNotification({ userId: app.candidateId, type: "REJECTION", message: "Thank you for applying. We will not be moving forward at this time.", relatedAppId: app.id });
  await prisma.auditLog.create({ data: { actorId: user.id, action: "REJECT", meta: j({ applicationId }) } });
  revalidateCandidateRoutes();
  return { ok: true };
}

export async function sendNotificationAction(applicationId: string, formData: FormData) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedApplication(user, applicationId);
  const message = String(formData.get("message") || "").trim();
  if (!message) return { error: "Message is required." };
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app) return { error: "Not found." };
  await createNotification({ userId: app.candidateId, type: "RECRUITER_MSG", message, relatedAppId: app.id });
  await prisma.auditLog.create({ data: { actorId: user.id, action: "NOTIFY", meta: j({ applicationId }) } });
  return { ok: true };
}

// ---- funnel editing ----
function newStageId() {
  return "st-" + Math.random().toString(36).slice(2, 8);
}

async function persistFunnelStructure(userId: string, funnelId: string, stages: FunnelStage[], change: Record<string, unknown>) {
  const funnel = await prisma.funnel.findUnique({ where: { id: funnelId }, include: { _count: { select: { applications: true } } } });
  if (!funnel) return { error: "Not found." } as const;
  if (stages.some((stage) => stage.type === "MANUAL_REVIEW")) return { error: "Manual Review is not a portal stage." } as const;
  const normalized = stages.map((stage, index) => ({ ...stage, order: index + 1 }));
  if (new Set(normalized.map((stage) => stage.type)).size !== normalized.length) return { error: "Each phase type can only be used once in a funnel." } as const;
  if (funnel._count.applications === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.funnel.update({ where: { id: funnelId }, data: { stages: j(normalized) } });
      await tx.auditLog.create({ data: { actorId: userId, action: "FUNNEL_EDIT", meta: j({ funnelId, ...change }) } });
    });
    return { ok: true, funnelId } as const;
  }
  const maxVersion = (await prisma.funnel.aggregate({ where: { driveId: funnel.driveId }, _max: { version: true } }))._max.version || funnel.version;
  const created = await prisma.$transaction(async (tx) => {
    await tx.funnel.update({ where: { id: funnelId }, data: { published: false } });
    const next = await tx.funnel.create({ data: { driveId: funnel.driveId, name: funnel.name, version: maxVersion + 1, published: true, stages: j(normalized) } });
    await tx.auditLog.create({ data: { actorId: userId, action: "FUNNEL_VERSIONED", meta: j({ driveId: funnel.driveId, from: funnelId, to: next.id, version: next.version, ...change }) } });
    return next;
  });
  return { ok: true, versioned: true, funnelId: created.id } as const;
}

export async function addStageAction(funnelId: string, formData: FormData) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedFunnel(user, funnelId);
  const funnel = await prisma.funnel.findUnique({ where: { id: funnelId } });
  if (!funnel) return { error: "Not found." };
  const stages = uj<any[]>(funnel.stages);
  const type = String(formData.get("type") || "ONSITE");
  if (type === "MANUAL_REVIEW") return { error: "Manual Review is not a portal stage." };
  if (stages.some((existing) => existing.type === type)) return { error: "That phase type already exists in this funnel." };
  const name = String(formData.get("name") || type);
  const gradingMode = String(formData.get("gradingMode") || "") || undefined;
  const pass = formData.get("passScore");
  const stage: any = {
    id: newStageId(),
    type,
    name,
    order: stages.length + 1,
    passAction: "NEXT",
    failAction: "HOLD",
  };
  if (gradingMode) stage.gradingMode = gradingMode;
  if (pass) stage.passScore = Number(pass);
  stages.push(stage);
  return persistFunnelStructure(user.id, funnelId, stages, { added: name });
}

export async function removeStageAction(funnelId: string, stageId: string) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedFunnel(user, funnelId);
  const funnel = await prisma.funnel.findUnique({ where: { id: funnelId } });
  if (!funnel) return { error: "Not found." };
  const before = uj<FunnelStage[]>(funnel.stages);
  const removed = before.find((stage) => stage.id === stageId);
  if (!removed) return { error: "Stage not found." };
  if (removed.type === "CV_SCREENING" || removed.type === "FINAL") return { error: "CV screening and final decision phases cannot be removed." };
  const stages = before.filter((stage) => stage.id !== stageId);
  return persistFunnelStructure(user.id, funnelId, stages, { removed: removed.name || removed.type });
}

export async function moveStageAction(funnelId: string, stageId: string, dir: "up" | "down") {
  const user = await requireRole("recruiter", "admin");
  await requireManagedFunnel(user, funnelId);
  const funnel = await prisma.funnel.findUnique({ where: { id: funnelId } });
  if (!funnel) return { error: "Not found." };
  const stages = uj<any[]>(funnel.stages);
  const idx = stages.findIndex((s) => s.id === stageId);
  const swap = dir === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swap < 0 || swap >= stages.length) return { ok: true };
  [stages[idx], stages[swap]] = [stages[swap], stages[idx]];
  stages.forEach((s, i) => (s.order = i + 1));
  return persistFunnelStructure(user.id, funnelId, stages, { moved: stageId, direction: dir });
}

// ---- Funnel creation (multiple funnels per drive) ----
export async function createFunnelAction(driveId: string, formData: FormData) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedDrive(user, driveId);
  const drive = await prisma.drive.findUnique({ where: { id: driveId } });
  if (!drive) return { error: "Drive not found." };
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Funnel name required." };
  let stages: FunnelStage[];
  try {
    stages = JSON.parse(String(formData.get("stages") || "[]"));
  } catch {
    return { error: "Invalid stages configuration." };
  }
  if (!Array.isArray(stages) || stages.length === 0) return { error: "Add at least one phase." };
  if (stages.some((stage) => stage.type === "MANUAL_REVIEW")) return { error: "Manual Review is not a portal stage." };
  if (new Set(stages.map((stage) => stage.type)).size !== stages.length) return { error: "Each phase type can only be used once in a funnel." };

  const reviewer = await prisma.user.findFirst({ where: { role: "reviewer" } });
  const norm = stages.map((s, i) => ({
    id: s.id || "st-" + Math.random().toString(36).slice(2, 8),
    type: s.type,
    name: s.name || s.type,
    order: i + 1,
    enabled: s.enabled !== false,
    gradingMode: AUTOMATIC_THRESHOLD_TYPES.has(s.type) ? "AUTO" : MANUAL_GRADING_TYPES.has(s.type) ? "MANUAL" : s.gradingMode,
    passScore: s.passScore,
    durationMin: s.durationMin,
    passAction: s.passAction || "NEXT",
    failAction: s.failAction || "REJECT",
    assignedReviewers: s.assignedReviewers || (reviewer ? [reviewer.id] : []),
    passTargetStageId: s.passTargetStageId,
    failTargetStageId: s.failTargetStageId,
  }));

  const funnel = await prisma.funnel.create({
    data: { driveId, name, version: 1, published: true, stages: j(norm) },
  });
  await prisma.auditLog.create({
    data: { actorId: user.id, action: "FUNNEL_PUBLISHED", meta: j({ driveId, funnelId: funnel.id, name, phases: norm.length }) },
  });
  return { ok: true, funnelId: funnel.id };
}

// Structural edit: if the funnel already has applications, create a NEW immutable
// version; otherwise edit in place. Per-phase THRESHOLD changes are operational
// (see applyPhaseThresholdAction) and do NOT bump the version.
export async function editFunnelStructureAction(funnelId: string, formData: FormData) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedFunnel(user, funnelId);
  const f = await prisma.funnel.findUnique({ where: { id: funnelId }, include: { _count: { select: { applications: true } } } });
  if (!f) return { error: "Not found." };
  let stages: FunnelStage[];
  try {
    stages = JSON.parse(String(formData.get("stages") || "[]"));
  } catch {
    return { error: "Invalid stages." };
  }
  if (!Array.isArray(stages) || stages.length === 0) return { error: "Add at least one phase." };
  if (stages.some((stage) => stage.type === "MANUAL_REVIEW")) return { error: "Manual Review is not a portal stage." };
  if (new Set(stages.map((stage) => stage.type)).size !== stages.length) return { error: "Each phase type can only be used once in a funnel." };
  const norm = stages.map((s, i) => ({ ...s, order: i + 1, enabled: s.enabled !== false, id: s.id || "st-" + Math.random().toString(36).slice(2, 8) }));

  return persistFunnelStructure(user.id, funnelId, norm, { source: "structure-editor" });
}

// ---- Per-phase threshold (read-only preview) ----
async function getPhaseCohort(funnelId: string, phaseType: string) {
  const apps = await prisma.application.findMany({
    where: { funnelId, currentStage: phaseType, phaseReleased: false },
    select: { id: true, candidateId: true, cvScore: true, cvResult: true, results: { where: { type: phaseType }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const rows = apps
    .map((a) => {
      if (phaseType === "CV_SCREENING") {
        return { id: a.id, candidateId: a.candidateId, score: a.cvScore ?? 0, result: (a.cvResult as any) || "FAIL" };
      }
      const r = a.results[0];
      if (!r) return null; // only include applications that actually have a result for this phase
      return { id: a.id, candidateId: a.candidateId, score: r.normalized ?? 0, result: (r.status as any) || "PENDING" };
    })
    .filter((x): x is { id: string; candidateId: string; score: number; result: any } => x !== null);
  return rows;
}

export async function previewPhaseThresholdAction(funnelId: string, phaseType: string, proposed: number) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedFunnel(user, funnelId);
  const funnel = await getFunnel(funnelId);
  if (!funnel) return null;
  const current = phaseThreshold(funnel, phaseType as StageType);
  if (AUTOMATIC_THRESHOLD_TYPES.has(phaseType)) {
    return { currentThreshold: current, proposedThreshold: proposed, eligible: 0, passToFail: 0, failToPass: 0, unchanged: 0, details: [], futureOnly: true };
  }
  const cohort = await getPhaseCohort(funnelId, phaseType);
  const apps: PhaseApplication[] = cohort.map((c) => ({ id: c.id, score: c.score, result: c.result }));
  return previewPhaseThreshold(current, proposed, apps);
}

// Apply a per-phase threshold change: operational (in-place), transactional,
// optimistic-concurrency guarded, with re-evaluation + notifications only on
// actual result changes. Scoped strictly to drive+funnel+phase.
export async function applyPhaseThresholdAction(
  funnelId: string,
  phaseType: string,
  proposed: number,
  snapshot: number,
) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedFunnel(user, funnelId);
  const funnelRow = await prisma.funnel.findUnique({ where: { id: funnelId } });
  if (!funnelRow) return { error: "Funnel not found." };
  const funnel = await getFunnel(funnelId);
  if (!funnel) return { error: "Funnel not found." };

  const current = phaseThreshold(funnel, phaseType as StageType);
  if (current !== snapshot) {
    return { error: "The threshold was changed by another recruiter. Please review the latest value before applying." };
  }

  if (AUTOMATIC_THRESHOLD_TYPES.has(phaseType)) {
    await prisma.$transaction(async (tx) => {
      const stages = uj<FunnelStage[]>(funnelRow.stages);
      const target = stages.find((stage) => stage.type === phaseType);
      if (target) target.passScore = Math.max(0, Math.min(100, proposed));
      await tx.funnel.update({ where: { id: funnelId }, data: { stages: j(stages) } });
      await tx.thresholdChange.create({ data: { driveId: funnelRow.driveId, funnelId, phaseType, oldThreshold: snapshot, newThreshold: proposed, actorId: user.id, affected: 0 } });
      await tx.auditLog.create({ data: { actorId: user.id, action: "AUTOMATIC_THRESHOLD_CHANGED", meta: j({ driveId: funnelRow.driveId, funnelId, phaseType, old: snapshot, new: proposed, appliesTo: "future-submissions" }) } });
    });
    revalidateCandidateRoutes();
    redirect(user.role === "admin" ? `/admin/funnel/${funnelId}?thresholdApplied=${proposed}` : `/recruiter/funnel/${funnelId}?thresholdApplied=${proposed}`);
  }

  const cohort = await getPhaseCohort(funnelId, phaseType);
  const apps: PhaseApplication[] = cohort.map((c) => ({ id: c.id, score: c.score, result: c.result }));
  const changes = applyPhaseThreshold(apps, proposed, user.id, new Date().toISOString());

  await prisma.$transaction(async (tx) => {
    const stages = uj<FunnelStage[]>(funnelRow.stages);
    const target = stages.find((s) => s.type === phaseType);
    if (target) target.passScore = proposed;
    await tx.funnel.update({ where: { id: funnelId }, data: { stages: j(stages) } });

    for (const c of changes) {
      if (!c.changed) continue;
      if (phaseType === "CV_SCREENING") {
        await tx.application.update({ where: { id: c.id }, data: { cvResult: c.newResult, status: c.newResult === "PASS" ? "IN_PROGRESS" : "HOLD", phaseReleased: false } });
      } else {
        const ar = await tx.assessmentResult.findFirst({ where: { applicationId: c.id, type: phaseType }, orderBy: { createdAt: "desc" } });
        if (ar) await tx.assessmentResult.update({ where: { id: ar.id }, data: { status: c.newResult } });
        await tx.application.update({ where: { id: c.id }, data: { status: c.newResult === "PASS" ? "IN_PROGRESS" : "HOLD", phaseReleased: false } });
      }
      const cand = cohort.find((a) => a.id === c.id)!;
      await tx.notification.create({
        data: {
          userId: cand.candidateId,
          type: "PHASE_THRESHOLD",
          message: `Your ${phaseType} result was re-evaluated and is now: ${c.newResult} (threshold ${proposed}).`,
          relatedAppId: cand.id,
        },
      });
    }
    await tx.thresholdChange.create({
      data: {
        driveId: funnelRow.driveId,
        funnelId,
        phaseType,
        oldThreshold: snapshot,
        newThreshold: proposed,
        actorId: user.id,
        passToFail: changes.filter((c) => c.changed && c.newResult === "FAIL").length,
        failToPass: changes.filter((c) => c.changed && c.newResult === "PASS").length,
        affected: changes.length,
      },
    });
    await tx.auditLog.create({
      data: { actorId: user.id, action: "PHASE_THRESHOLD_CHANGED", meta: j({ driveId: funnelRow.driveId, funnelId, phaseType, old: snapshot, new: proposed }) },
    });
  });

  const preselectParam = buildPreselectParam(changes, phaseType, proposed);

  redirect(user.role === "admin" ? `/admin/funnel/${funnelId}?thresholdApplied=${proposed}${preselectParam}` : `/recruiter/funnel/${funnelId}?thresholdApplied=${proposed}${preselectParam}`);
}

// Inside applyPhaseThresholdAction, before redirect:
function buildPreselectParam(changes: { changed: boolean; newResult: string; id: string }[], phaseType: string, proposed: number) {
  const ids = changes.filter((c) => c.changed && c.newResult === "PASS").map((c) => c.id);
  return ids.length ? `&phase=${phaseType}&preselect=${ids.join(",")}` : "";
}

// ---- Cohort issuance (gated next stage) ----
export async function issueNextPhaseAction(
  funnelId: string,
  phaseType: string,
  applicationIds: string[],
  mode: "passing" | "selected",
) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedFunnel(user, funnelId);
  if (AUTOMATIC_THRESHOLD_TYPES.has(phaseType)) {
    return { error: `${phaseType} applies its threshold and releases the next phase automatically.` };
  }
  const funnel = await getFunnel(funnelId);
  if (!funnel) return { error: "Funnel not found." };
  const next = nextEnabledStage(funnel, { type: phaseType as StageType });
  if (!next) return { error: "No next phase configured after this stage." };
  const nextName = next.name || next.type;
  const reachingFinal = next.type === "FINAL";

  const cohort = await getPhaseCohort(funnelId, phaseType);
  let targetIds = applicationIds;
  if (mode === "passing") {
    targetIds = cohort.filter((c) => c.result === "PASS").map((c) => c.id);
  } else {
    const cohortIds = new Set(cohort.map((candidate) => candidate.id));
    targetIds = applicationIds.filter((id) => cohortIds.has(id));
  }
  if (targetIds.length === 0) return { ok: true, count: 0 };

  let releasedCount = 0;
  await prisma.$transaction(async (tx) => {
    for (const id of targetIds) {
      const prev = await tx.application.findUnique({ where: { id }, select: { stageHistory: true, candidateId: true, currentStage: true, phaseReleased: true } });
      if (!prev || prev.currentStage !== phaseType || prev.phaseReleased) continue;
      const updated = await tx.application.updateMany({
        where: { id, funnelId, currentStage: phaseType, phaseReleased: false },
        data: {
          currentStage: next.type,
          phaseReleased: !reachingFinal,
          status: reachingFinal ? "HOLD" : "IN_PROGRESS",
          stageHistory: j([
            ...(uj<any[]>(prev?.stageHistory) || []),
            { stage: phaseType, status: "ISSUED", at: new Date().toISOString(), note: `Next phase released: ${nextName}` },
          ]),
        },
      });
      if (updated.count !== 1) continue;
      releasedCount += 1;
      await createNotification({ userId: prev.candidateId, type: "PHASE_RELEASED", message: reachingFinal ? "Your assessments are complete. The final decision is pending." : `Next phase released: ${nextName}.`, relatedAppId: id }, tx);
    }
    await tx.auditLog.create({
      data: { actorId: user.id, action: "ISSUE_NEXT_PHASE", meta: j({ funnelId, phaseType, next: next.type, count: releasedCount, mode }) },
    });
  });
  revalidateCandidateRoutes();
  return { ok: true, count: releasedCount };
}

export async function rejectSelectedAction(applicationIds: string[], formData?: FormData) {
  const user = await requireRole("recruiter", "admin");
  let ids = applicationIds;
  if (formData) {
    const raw = String(formData.get("ids") || "[]");
    try {
      ids = JSON.parse(raw);
    } catch {
      ids = [];
    }
  }
  ids = await managedApplicationIds(user, ids);
  for (const id of ids) {
    const app = await prisma.application.findUnique({ where: { id }, select: { candidateId: true } });
    if (!app) continue;
    await prisma.application.update({ where: { id }, data: { status: "REJECTED" } });
    await prisma.notification.create({
      data: { userId: app.candidateId, type: "REJECTION", message: "Thank you for applying. We will not be moving forward at this time." },
    });
  }
  await prisma.auditLog.create({ data: { actorId: user.id, action: "REJECT_BATCH", meta: j({ count: ids.length }) } });
  return { ok: true };
}

export async function offerSelectedAction(applicationIds: string[], formData?: FormData) {
  const user = await requireRole("recruiter", "admin");
  let ids = applicationIds;
  if (formData) {
    const raw = String(formData.get("ids") || "[]");
    try {
      ids = JSON.parse(raw);
    } catch {
      ids = [];
    }
  }
  ids = await managedApplicationIds(user, ids);
  for (const id of ids) {
    const app = await prisma.application.findUnique({ where: { id }, select: { candidateId: true } });
    if (!app) continue;
    await prisma.application.update({ where: { id }, data: { status: "OFFERED" } });
    await prisma.notification.create({
      data: { userId: app.candidateId, type: "OFFER", message: "Congratulations! We would like to offer you the position." },
    });
  }
  await prisma.auditLog.create({ data: { actorId: user.id, action: "OFFER_BATCH", meta: j({ count: ids.length }) } });
  return { ok: true };
}

// Enable / disable a phase. Structural change: creates a new immutable version
// when the funnel already has applications; otherwise edits in place.
export async function toggleStageEnabledAction(funnelId: string, stageId: string) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedFunnel(user, funnelId);
  const f = await prisma.funnel.findUnique({ where: { id: funnelId }, include: { _count: { select: { applications: true } } } });
  if (!f) return { error: "Not found." };
  const stages = uj<FunnelStage[]>(f.stages);
  const st = stages.find((s) => s.id === stageId);
  if (!st) return { error: "Stage not found." };
  st.enabled = st.enabled === false;
  return persistFunnelStructure(user.id, funnelId, stages, { toggled: stageId });
}

// Drains the CV queue: retries any QUEUED job and re-runs FAILED jobs on demand.
// Idempotent at the job level (a COMPLETED job is never re-scored).
export async function processCvJobsAction() {
  await requireRole("admin");
  const { processDueCvJobs } = await import("@/lib/cv/worker");
  await processDueCvJobs();
  return { ok: true };
}

// Recruiter/admin issues a retest for a stage. Creates a fresh ACTIVE attempt
// (so the candidate can retake) and re-releases the stage. mode ONLINE = the
// candidate retakes in the portal (still proctored); ONSITE = the same test is
// taken onsite (human-proctored). Either way both results are stored so the
// online vs onsite scores can be compared.
export async function requestRetestAction(applicationId: string, formData: FormData) {
  const user = await requireRole("recruiter", "admin");
  const type = String(formData.get("type") || "");
  const mode = String(formData.get("mode") || "") as "ONLINE" | "ONSITE";
  if (!type || !(mode === "ONLINE" || mode === "ONSITE")) return { error: "Invalid stage or mode." };
  const app = await prisma.application.findUnique({ where: { id: applicationId }, include: { drive: true, funnel: true } });
  if (!app) return { error: "Not found." };
  if (user.role === "recruiter" && app.drive?.ownerId !== user.id) return { error: "Not authorized." };
  const funnel = app.funnelId ? await getFunnel(app.funnelId) : null;
  const stage = funnel?.stages.find((s) => s.type === type);
  if (!stage || type === "CV_SCREENING" || type === "FINAL") return { error: "This stage cannot be reissued." };
  const last = await prisma.assessmentAttempt.findFirst({ where: { applicationId, type }, orderBy: { attemptNumber: "desc" } });
  const attemptNumber = (last?.attemptNumber ?? 0) + 1;
  await prisma.assessmentAttempt.updateMany({
    where: { applicationId, type, status: "ACTIVE" },
    data: { status: "CANCELLED" },
  });
  await prisma.assessmentAttempt.create({
    data: {
      applicationId,
      type,
      mode,
      attemptNumber,
      startedAt: null,
      deadlineAt: null,
      status: "READY",
      idempotencyKey: `${applicationId}:${type}:${attemptNumber}:${mode}`,
    },
  });
  await prisma.application.update({
    where: { id: applicationId },
    data: { currentStage: type, phaseReleased: true, status: "IN_PROGRESS" },
  });
  await createNotification({
    userId: app.candidateId,
    type: "RETEST_ISSUED",
    message: `${mode === "ONSITE" ? "Onsite" : "Online"} ${stage?.name || type} retest issued. Your timer will start when you begin.`,
    relatedAppId: app.id,
  });
  await prisma.auditLog.create({
    data: { actorId: user.id, action: "RETEST_ISSUED", meta: j({ applicationId, type, mode, attemptNumber }) },
  });
  revalidateCandidateRoutes();
  return { ok: true };
}

export async function requestRetestsAction(applicationIds: string[]) {
  const user = await requireRole("recruiter", "admin");
  const ids = await managedApplicationIds(user, applicationIds);
  const apps = await prisma.application.findMany({
    where: { id: { in: ids } },
    select: { id: true, currentStage: true, results: { select: { type: true } } },
  });
  let count = 0;
  for (const app of apps) {
    const type = app.currentStage;
    if (!type || !app.results.some((result) => result.type === type)) continue;
    const formData = new FormData();
    formData.set("type", type);
    formData.set("mode", "ONLINE");
    const result = await requestRetestAction(app.id, formData);
    if ("ok" in result && result.ok) count++;
  }
  return { ok: true, count };
}

export async function sendBulkNotificationAction(applicationIds: string[], message: string) {
  const user = await requireRole("recruiter", "admin");
  const clean = message.trim();
  if (!clean) return { error: "Message is required." };
  const ids = await managedApplicationIds(user, applicationIds);
  const apps = await prisma.application.findMany({ where: { id: { in: ids } }, select: { id: true, candidateId: true } });
  await prisma.$transaction(async (tx) => {
    for (const app of apps) {
      await createNotification({ userId: app.candidateId, type: "RECRUITER_MSG", message: clean, relatedAppId: app.id }, tx);
    }
    await tx.auditLog.create({ data: { actorId: user.id, action: "NOTIFY_BATCH", meta: j({ count: apps.length }) } });
  });
  revalidateCandidateRoutes();
  return { ok: true, count: apps.length };
}
