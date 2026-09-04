"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma, j, uj, getFunnel } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { decideApplication, type StaffDecision } from "@/lib/staffDecision";
import { onsiteNext } from "@/lib/onsiteTrack";
import { cleanSkills } from "@/lib/jobSkills";
import { onsiteInviteEmail } from "@/lib/email";
import { publicApplyPath } from "@/lib/publicApplications";
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
  firstAssessmentStage,
} from "@/lib/engine/funnel";

const AUTOMATIC_THRESHOLD_TYPES = new Set(["CV_SCREENING", "CCAT", "MTT"]);
const MANUAL_GRADING_TYPES = new Set(["CODING", "ESSAY", "PROMPT", "RAT", "ENGLISH_SPEAKING"]);

// Routes that display candidate/funnel state. Revalidate them after any mutation
// so the recruiter UI and the candidate-facing page reflect the change immediately.
function revalidateCandidateRoutes() {
  try {
    revalidatePath("/admin");
    revalidatePath("/admin/candidates");
    revalidatePath("/admin/audit");
    revalidatePath("/candidate", "layout");
    revalidatePath("/recruiter/candidates");
    revalidatePath("/recruiter/candidates/[id]", "page");
    revalidatePath("/recruiter/drives/[id]", "page");
    revalidatePath("/recruiter/funnel/[id]", "page");
    revalidatePath("/candidate/application/[id]", "page");
  } catch (error) {
    // Server actions have a static-generation store; direct unit calls do not.
    if (!(error instanceof Error) || !error.message.includes("static generation store missing")) throw error;
  }
}

type FunnelAssignmentMode = "ADD" | "MOVE";

async function assignApplicationToFunnel(
  user: any,
  applicationId: string,
  funnelId: string,
  mode: FunnelAssignmentMode = "ADD",
  delivery: "ONLINE" | "ONSITE" = "ONLINE",
) {
  const app = await requireManagedApplication(user, applicationId);
  if (app.status === "ARCHIVED") return { error: "Historical tracks are read-only. Select an active application." };
  const funnelRow = await prisma.funnel.findFirst({ where: { id: funnelId, driveId: app.driveId, published: true } });
  if (!funnelRow) return { error: "Select a published funnel for this drive." };
  if (app.cvScore == null || ["PROCESSING", "FAILED"].includes(app.cvResult || "")) return { error: "Wait for CV screening to finish before assigning a funnel." };
  const funnel = await getFunnel(funnelId);
  if (!funnel) return { error: "Funnel not found." };
  const onsite = delivery === "ONSITE";
  const trackKey = onsite ? `ONSITE:${funnelId}` : funnelId;
  if (!onsite && app.funnelId === funnelId) return { error: `This candidate already has a track in ${funnelRow.name}.` };
  const existingTrack = await prisma.application.findFirst({
    where: { candidateId: app.candidateId, driveId: app.driveId, ...(onsite ? { trackKey } : { funnelId, NOT: { trackKey: { startsWith: "ONSITE:" } } }) },
    select: { id: true, status: true },
  });
  if (existingTrack) {
    return { error: existingTrack.status === "ARCHIVED"
      ? `This candidate already has historical progress in ${funnelRow.name}. Choose a different funnel.`
      : `This candidate already has a separate track in ${funnelRow.name}.` };
  }
  const onsiteStart = onsite ? onsiteNext(funnel) : null;
  const firstAssessment = onsiteStart ? funnel.stages.find((stage) => stage.type === onsiteStart.currentStage) : firstAssessmentStage(funnel);
  if (!firstAssessment) return { error: "This funnel has no assessment after CV screening." };
  if (onsite && onsiteStart?.currentStage === "FINAL") return { error: "Choose a funnel containing at least one enabled test." };
  const reachingFinal = firstAssessment.type === "FINAL";
  const reachingOnsite = firstAssessment.type === "ONSITE";
  const opensAt = firstAssessment.opensAt ? new Date(firstAssessment.opensAt) : null;
  const scheduled = Boolean(opensAt && Number.isFinite(opensAt.getTime()) && opensAt.getTime() > Date.now());
  const createSeparateTrack = onsite || Boolean(app.funnelId);
  const movingTrack = createSeparateTrack && mode === "MOVE";
  const sourceApplicationId = app.sourceApplicationId || app.id;
  const sourceScores = uj<Record<string, number>>(app.scores) || {};
  const cvOnlyScores = sourceScores.CV_SCREENING == null ? {} : { CV_SCREENING: sourceScores.CV_SCREENING };
  const cvJob = createSeparateTrack
    ? await prisma.cvJob.findFirst({ where: { applicationId: app.id }, orderBy: { createdAt: "desc" } })
    : null;
  const releaseMessage = scheduled
    ? `${firstAssessment.name} will open on ${opensAt!.toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC.`
    : `${firstAssessment.name} is now available.`;
  let targetApplicationId = applicationId;
  await prisma.$transaction(async (tx) => {
    const nextHistory = [
      ...(createSeparateTrack ? [{ stage: "CV_SCREENING", status: "REUSED", at: new Date().toISOString(), note: `CV screening reused from application ${sourceApplicationId.slice(0, 8).toUpperCase()}` }] : (uj<any[]>(app.stageHistory) || [])),
      { stage: firstAssessment.type, status: reachingFinal || reachingOnsite || scheduled ? "PENDING" : "RELEASED", at: new Date().toISOString(), note: `Selected for ${funnelRow.name}; ${reachingOnsite ? "onsite invitation details pending" : releaseMessage}` },
    ];
    const trackState = {
      funnelId,
      funnelVersion: funnelRow.version,
      status: reachingFinal || reachingOnsite || scheduled ? "HOLD" : "IN_PROGRESS",
      currentStage: firstAssessment.type,
      phaseReleased: !reachingFinal && !reachingOnsite,
      stageHistory: j(nextHistory),
    };

    if (createSeparateTrack) {
      const created = await tx.application.create({
        data: {
          candidateId: app.candidateId,
          driveId: app.driveId,
          sourceApplicationId,
          trackKey,
          ...trackState,
          cvScore: app.cvScore,
          cvResult: app.cvResult,
          extractedCv: app.extractedCv,
          scores: j(cvOnlyScores),
          appliedAt: app.appliedAt,
        },
      });
      targetApplicationId = created.id;
      if (cvJob) {
        await tx.cvJob.create({
          data: {
            applicationId: targetApplicationId,
            fileName: cvJob.fileName,
            fileType: cvJob.fileType,
            storagePath: cvJob.storagePath,
            status: cvJob.status,
            retryCount: cvJob.retryCount,
            attempts: cvJob.attempts,
            error: cvJob.error,
            extractedText: cvJob.extractedText,
          },
        });
      }
      if (movingTrack) {
        await tx.assessmentAttempt.updateMany({
          where: { applicationId, status: { in: ["ACTIVE", "READY"] } },
          data: { status: "CANCELLED" },
        });
        await tx.application.update({
          where: { id: applicationId },
          data: {
            status: "ARCHIVED",
            phaseReleased: false,
            stageHistory: j([
              ...(uj<any[]>(app.stageHistory) || []),
              { stage: app.currentStage || "CV_SCREENING", status: "MOVED", at: new Date().toISOString(), note: `Moved to ${funnelRow.name}; this track remains available to recruitment staff as history.` },
            ]),
          },
        });
      }
    } else {
      await tx.application.update({ where: { id: applicationId }, data: trackState });
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: movingTrack ? "FUNNEL_TRACK_MOVED" : createSeparateTrack ? "FUNNEL_TRACK_CREATED" : "FUNNEL_ASSIGNED",
        meta: j({ sourceApplicationId, applicationId: targetApplicationId, archivedApplicationId: movingTrack ? applicationId : null, assignmentMode: mode, delivery, fromFunnelId: app.funnelId, funnelId, version: funnelRow.version, cvResult: app.cvResult, firstStage: firstAssessment.type }),
      },
    });
    const trackPrefix = movingTrack
      ? `Your assessment path has moved to ${funnelRow.name}. `
      : createSeparateTrack
        ? `A new assessment track was created for ${funnelRow.name}. `
        : `You were selected for ${funnelRow.name}. `;
    const message = onsite ? `Your onsite assessment session for ${funnelRow.name} is ready. ${releaseMessage} Complete each test in sequence; the recruitment team reviews your results afterward.` : reachingFinal
      ? `${trackPrefix}The recruitment team will contact you about the final step.`
      : reachingOnsite
        ? `${trackPrefix}Date and location details for onsite screening will be emailed by the recruitment team.`
        : `${trackPrefix}${releaseMessage}`;
    await createNotification({ userId: app.candidateId, type: "FUNNEL_ASSIGNED", message, relatedAppId: targetApplicationId }, tx);
  });
  return { ok: true, applicationId: targetApplicationId, createdTrack: createSeparateTrack, movedTrack: movingTrack };
}

export async function assignOnsiteFunnelAction(applicationIds: string[], funnelId: string) {
  const user = await requireRole("recruiter", "admin");
  const ids = await managedApplicationIds(user, applicationIds);
  if (!ids.length) return { error: "Select at least one applicant you can manage.", count: 0 };
  const seen = new Set<string>();
  let count = 0;
  const errors: string[] = [];
  for (const id of ids) {
    const app = await requireManagedApplication(user, id);
    const key = `${app.candidateId}:${app.driveId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const result = await assignApplicationToFunnel(user, id, funnelId, "ADD", "ONSITE");
    if ("error" in result) errors.push(result.error!); else count++;
  }
  revalidateCandidateRoutes();
  return errors.length ? { error: `${count} onsite sessions assigned. ${errors.join(" ")}`, count } : { ok: true, count };
}

export async function assignCandidateFunnelAction(applicationId: string, formData: FormData) {
  const user = await requireRole("recruiter", "admin");
  const requestedMode = String(formData.get("assignmentMode") || "ADD");
  const mode: FunnelAssignmentMode = requestedMode === "MOVE" ? "MOVE" : "ADD";
  const result = await assignApplicationToFunnel(user, applicationId, String(formData.get("funnelId") || ""), mode);
  revalidateCandidateRoutes();
  return result;
}

export async function assignSelectedFunnelAction(applicationIds: string[], funnelId: string, mode: FunnelAssignmentMode = "ADD") {
  const user = await requireRole("recruiter", "admin");
  const ids = await managedApplicationIds(user, applicationIds);
  if (!ids.length) return { error: "Select at least one applicant you can manage.", count: 0 };

  // Independent candidate tracks can be prepared concurrently. The previous
  // serial loop made a three-row action visibly land one row at a time on a
  // remote Supabase database. Small batches keep latency low without flooding
  // the connection pool when a whole page is selected.
  const results: Awaited<ReturnType<typeof assignApplicationToFunnel>>[] = [];
  const batchSize = 5;
  for (let offset = 0; offset < ids.length; offset += batchSize) {
    results.push(...await Promise.all(
      ids.slice(offset, offset + batchSize).map((id) => assignApplicationToFunnel(user, id, funnelId, mode)),
    ));
  }
  const count = results.filter((result) => !("error" in result)).length;
  const errors: string[] = [];
  results.forEach((result, index) => {
    if ("error" in result) errors.push(`${ids[index].slice(0, 8)}: ${result.error}`);
  });
  revalidateCandidateRoutes();
  return errors.length ? { error: `${count} assigned. ${errors.join(" ")}`, count } : { ok: true, count };
}

export async function createDriveAction(formData: FormData) {
  const user = await requireRole("recruiter", "admin");
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Name is required." };
  const cvPassThreshold = Math.max(0, Math.min(100, Number(formData.get("cvPassThreshold") || 60)));
  const location = String(formData.get("location") || "");
  const jobDescription = String(formData.get("jobDescription") || "");
  const requiredSkills = cleanSkills(formData.get("requiredSkills"));
  const preferredSkills = cleanSkills(formData.get("preferredSkills")).filter((skill) => !requiredSkills.includes(skill));
  const deadlineRaw = String(formData.get("deadline") || "");
  const deadline = new Date(deadlineRaw);
  if (!deadlineRaw || isNaN(deadline.getTime())) return { error: "A valid deadline is required." };
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (deadline < startOfToday) return { error: "Deadline must be today or a future date." };
  const createDefaultFunnel = formData.get("createDefaultFunnel") === "on";
  const defaultFunnelName = String(formData.get("defaultFunnelName") || "Default Funnel").trim().slice(0, 100);
  let defaultStages: FunnelStage[] = [];
  if (createDefaultFunnel) {
    try {
      defaultStages = JSON.parse(String(formData.get("defaultFunnelStages") || "[]"));
    } catch {
      return { error: "Invalid default funnel configuration." };
    }
    const allowed = new Set<StageType>(["CV_SCREENING", "CCAT", "MTT", "GAMES", "CODING", "ESSAY", "PROMPT", "ENGLISH_SPEAKING", "ONSITE", "FINAL"]);
    if (!Array.isArray(defaultStages) || defaultStages.length < 2) return { error: "The default funnel needs CV screening and final decision phases." };
    if (defaultStages.some((stage) => !allowed.has(stage.type))) return { error: "The default funnel contains an unsupported phase." };
    if (new Set(defaultStages.map((stage) => stage.type)).size !== defaultStages.length) return { error: "Each default funnel phase can only be used once." };
    if (defaultStages[0]?.type !== "CV_SCREENING" || defaultStages.at(-1)?.type !== "FINAL") return { error: "CV screening must be first and final decision must be last." };
  }
  const reviewer = createDefaultFunnel ? await prisma.user.findFirst({ where: { role: "reviewer" }, select: { id: true } }) : null;

  const drive = await prisma.$transaction(async (tx) => {
    const createdDrive = await tx.drive.create({
      data: {
        name,
        jobDescription,
        location,
        deadline,
        publicLink: "", // replaced with immutable-ID URL in this transaction
        status: "OPEN",
        cvPassThreshold,
        tciWeights: j({ CV_SCREENING: 10, GAMES: 10, CCAT: 15, MTT: 15, ESSAY: 10, CODING: 25, PROMPT: 15 }),
        rubricConfig: j({ ccat: { threshold: 55 }, mtt: { threshold: 55 }, ...(formData.has("requiredSkills") ? { cvSkills: { required: requiredSkills, preferred: preferredSkills } } : {}) }),
        thresholdHistory: j([]),
        ownerId: user.id,
      },
    });
    await tx.drive.update({ where: { id: createdDrive.id }, data: { publicLink: publicApplyPath(createdDrive.id) } });
    let defaultFunnelId: string | null = null;
    if (createDefaultFunnel) {
      const normalized = defaultStages.map((stage, index) => ({
        id: `st-${Math.random().toString(36).slice(2, 8)}`,
        type: stage.type,
        name: String(stage.name || stage.type).slice(0, 100),
        order: index + 1,
        enabled: true,
        gradingMode: AUTOMATIC_THRESHOLD_TYPES.has(stage.type) ? "AUTO" : MANUAL_GRADING_TYPES.has(stage.type) ? "MANUAL" : "AUTO",
        passScore: Math.max(0, Math.min(100, Number(stage.passScore) || 0)),
        durationMin: Math.max(0, Math.min(240, Number(stage.durationMin) || 0)),
        passAction: "NEXT",
        failAction: stage.type === "CV_SCREENING" ? "HOLD" : "REJECT",
        assignedReviewers: reviewer ? [reviewer.id] : [],
      }));
      const funnel = await tx.funnel.create({
        data: { driveId: createdDrive.id, name: defaultFunnelName || "Default Funnel", version: 1, published: true, stages: j(normalized) },
      });
      defaultFunnelId = funnel.id;
      await tx.$executeRaw`UPDATE "Drive" SET "defaultFunnelId" = ${defaultFunnelId} WHERE "id" = ${createdDrive.id}`;
      await tx.auditLog.create({ data: { actorId: user.id, action: "FUNNEL_PUBLISHED", meta: j({ driveId: createdDrive.id, funnelId: funnel.id, name: funnel.name, phases: normalized.length, default: true }) } });
    }
    await tx.auditLog.create({
      data: { actorId: user.id, action: "DRIVE_CREATED", meta: j({ driveId: createdDrive.id, name, defaultFunnelId }) },
    });
    return createdDrive;
  });

  redirect(user.role === "admin" ? `/admin/drives/${drive.id}` : `/recruiter/drives/${drive.id}`);
}

// ---- 2-step CV threshold change ----
async function driveCvCohort(driveId: string, db = prisma as any) {
  return db.application.findMany({ where: { driveId, currentStage: "CV_SCREENING", cvScore: { not: null }, cvResult: { notIn: ["PROCESSING", "FAILED"] }, status: { in: ["HOLD", "IN_PROGRESS", "SUBMITTED"] } } });
}
export async function previewThresholdAction(driveId: string, proposed: number) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedDrive(user, driveId);
  if (!Number.isFinite(proposed) || proposed < 0 || proposed > 100) throw new Error("Threshold must be between 0 and 100.");
  const drive = await prisma.drive.findUniqueOrThrow({ where: { id: driveId } });
  const apps = await driveCvCohort(driveId);
  return thresholdPreview(drive.cvPassThreshold, proposed, apps.map((a: any) => ({ id: a.id, score: a.cvScore, result: a.cvResult })));
}
export async function applyThresholdAction(driveId: string, proposed: number, currentSnapshot: number) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedDrive(user, driveId);
  if (!Number.isFinite(proposed) || proposed < 0 || proposed > 100) return { error: "Threshold must be between 0 and 100." };
  try {
    const count = await prisma.$transaction(async (tx) => {
      const saved = await tx.drive.updateMany({ where: { id: driveId, cvPassThreshold: currentSnapshot }, data: { cvPassThreshold: proposed } });
      if (saved.count !== 1) throw new Error("The threshold changed. Preview again.");
      const apps = await driveCvCohort(driveId, tx);
      for (const app of apps) await decideApplication(tx, app.id, user.id, app.cvScore >= proposed ? "PASS" : "HOLD", "CV_SCREENING");
      await tx.auditLog.create({ data: { actorId: user.id, action: "CV_THRESHOLD_CHANGED", meta: j({ driveId, oldThreshold: currentSnapshot, newThreshold: proposed, affected: apps.length }) } });
      return apps.length;
    }, { timeout: 30000 });
    revalidateCandidateRoutes();
    return { ok: true, count };
  } catch (error) { return { error: error instanceof Error ? error.message : "Could not apply threshold." }; }
}

// ---- candidate actions ----
export async function decideCandidateAction(applicationId: string, decision: StaffDecision, expectedStage?: string) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedApplication(user, applicationId);
  if (!["HOLD", "PASS", "FAIL"].includes(decision)) return { error: "Invalid decision." };
  try {
    const result = await prisma.$transaction((tx) => decideApplication(tx, applicationId, user.id, decision, expectedStage));
    revalidateCandidateRoutes();
    return result;
  } catch (error) { return { error: error instanceof Error ? error.message : "Could not save decision." }; }
}

// Compatibility for stale clients: advancing now requires the same scored approval.
export async function advanceApplicationAction(applicationId: string) { return manualPassAction(applicationId); }
export async function manualPassAction(applicationId: string, expectedStage?: string) { return decideCandidateAction(applicationId, "PASS", expectedStage); }
export async function holdApplicationAction(applicationId: string, expectedStage?: string) { return decideCandidateAction(applicationId, "HOLD", expectedStage); }
export async function decideSelectedAction(applicationIds: string[], decision: StaffDecision, expectedStage?: string) {
  const user = await requireRole("recruiter", "admin");
  const ids = await managedApplicationIds(user, applicationIds);
  if (!ids.length) return { ok: true, count: 0 };
  try {
    // One authenticated, atomic transaction prevents a bulk decision from
    // becoming partially visible while the remaining candidates are updated.
    await prisma.$transaction(async (tx) => {
      for (const id of ids) await decideApplication(tx, id, user.id, decision, expectedStage);
    }, { timeout: 30000 });
    revalidateCandidateRoutes();
    return { ok: true, count: ids.length };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the bulk decision.", count: 0 };
  }
}
export async function passSelectedAction(applicationIds: string[], expectedStage?: string) { return decideSelectedAction(applicationIds, "PASS", expectedStage); }
export async function holdSelectedAction(applicationIds: string[], expectedStage?: string) { return decideSelectedAction(applicationIds, "HOLD", expectedStage); }
export async function advanceSelectedAction(applicationIds: string[]) { return passSelectedAction(applicationIds); }

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

export async function rejectApplicationAction(applicationId: string) { return decideCandidateAction(applicationId, "FAIL"); }

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

export async function addStaffNoteAction(applicationId: string, formData: FormData) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedApplication(user, applicationId);
  const message = String(formData.get("message") || "").trim();
  if (!message || message.length > 4000) return { error: "Enter a note of 1–4,000 characters." };
  await prisma.auditLog.create({ data: { actorId: user.id, action: "STAFF_NOTE", meta: j({ applicationId, message }) } });
  revalidateCandidateRoutes();
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
    opensAt: s.opensAt,
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
const waitingStatuses = ["HOLD", "IN_PROGRESS", "SUBMITTED"];
async function getPhaseCohort(funnelId: string, phaseType: string, db = prisma as any) {
  const apps = await db.application.findMany({
    where: { funnelId, currentStage: phaseType, phaseReleased: false, status: { in: waitingStatuses },
      assessmentAttempts: { none: { type: phaseType, status: { in: ["ACTIVE", "READY"] } } } },
    include: { results: { where: { type: phaseType }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 } },
  });
  return apps.flatMap((app: any) => {
    if (phaseType === "CV_SCREENING") return app.cvScore == null || ["PROCESSING", "FAILED"].includes(app.cvResult) ? [] : [{ id: app.id, score: app.cvScore, result: app.cvResult || "HOLD" }];
    const result = app.results[0];
    if (!result || (result.status === "MANUAL_REVIEW" && !result.gradedAt)) return [];
    return [{ id: app.id, score: result.normalized, result: result.status }];
  });
}
function thresholdPreview(current: number, proposed: number, cohort: Array<{ id: string; score: number; result: string }>) {
  const details = cohort.map((row) => ({ id: row.id, cvScore: row.score, oldResult: row.result, newResult: row.score >= proposed ? "PASS" : "HOLD", changed: row.result !== (row.score >= proposed ? "PASS" : "HOLD") }));
  return { currentThreshold: current, proposedThreshold: proposed, eligible: details.length,
    passing: details.filter((row) => row.newResult === "PASS").length,
    holding: details.filter((row) => row.newResult === "HOLD").length, details };
}
export async function previewPhaseThresholdAction(funnelId: string, phaseType: string, proposed: number) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedFunnel(user, funnelId);
  if (!Number.isFinite(proposed) || proposed < 0 || proposed > 100) throw new Error("Threshold must be between 0 and 100.");
  const funnel = await getFunnel(funnelId);
  if (!funnel) return null;
  return thresholdPreview(phaseThreshold(funnel, phaseType as StageType), proposed, await getPhaseCohort(funnelId, phaseType));
}
export async function applyPhaseThresholdAction(funnelId: string, phaseType: string, proposed: number, snapshot: number) {
  const user = await requireRole("recruiter", "admin");
  await requireManagedFunnel(user, funnelId);
  if (!Number.isFinite(proposed) || proposed < 0 || proposed > 100) return { error: "Threshold must be between 0 and 100." };
  try {
    const count = await prisma.$transaction(async (tx) => {
      const row = await tx.funnel.findUniqueOrThrow({ where: { id: funnelId } });
      const stages = uj<FunnelStage[]>(row.stages);
      const target = stages.find((stage) => stage.type === phaseType && stage.enabled !== false);
      if (!target || (target.passScore ?? 0) !== snapshot) throw new Error("The threshold changed. Preview again.");
      target.passScore = proposed;
      const saved = await tx.funnel.updateMany({ where: { id: funnelId, stages: row.stages }, data: { stages: j(stages) } });
      if (saved.count !== 1) throw new Error("The funnel changed. Preview again.");
      const cohort = await getPhaseCohort(funnelId, phaseType, tx);
      for (const candidate of cohort) {
        await decideApplication(tx, candidate.id, user.id, candidate.score >= proposed ? "PASS" : "HOLD", phaseType);
      }
      await tx.thresholdChange.create({ data: { driveId: row.driveId, funnelId, phaseType, oldThreshold: snapshot, newThreshold: proposed, actorId: user.id, affected: cohort.length, failToPass: cohort.filter((c: any) => c.score >= proposed).length } });
      await tx.auditLog.create({ data: { actorId: user.id, action: "PHASE_THRESHOLD_CHANGED", meta: j({ funnelId, phaseType, snapshot, proposed, affected: cohort.length }) } });
      return cohort.length;
    }, { timeout: 30000 });
    revalidateCandidateRoutes();
    return { ok: true, count };
  } catch (error) { return { error: error instanceof Error ? error.message : "Could not apply threshold." }; }
}

// Older clients cannot bypass scored approval via phase issuance.
export async function issueNextPhaseAction(funnelId: string, phaseType: string, applicationIds: string[], mode: "passing" | "selected") {
  const user = await requireRole("recruiter", "admin");
  await requireManagedFunnel(user, funnelId);
  const cohort = await getPhaseCohort(funnelId, phaseType);
  const ids = cohort.filter((row: any) => mode === "passing" ? row.result === "PASS" : applicationIds.includes(row.id)).map((row: any) => row.id);
  return passSelectedAction(ids, phaseType);
}

export async function rejectSelectedAction(applicationIds: string[], formData?: FormData) {
  let ids = applicationIds;
  if (formData) { try { ids = JSON.parse(String(formData.get("ids") || "[]")); } catch { return { error: "Invalid selection." }; } }
  return decideSelectedAction(ids, "FAIL");
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
  try {
    await prisma.$transaction(async (tx) => {
      const apps = await tx.application.findMany({ where: { id: { in: ids } } });
      if (apps.some((app) => app.currentStage !== "FINAL" || ["ARCHIVED", "REJECTED", "OFFERED", "HIRED"].includes(app.status))) throw new Error("Only candidates awaiting a final decision can be selected.");
      for (const app of apps) {
        await tx.application.update({ where: { id: app.id }, data: { status: "OFFERED", phaseReleased: false, stageHistory: j([...(uj<any[]>(app.stageHistory) || []), { stage: "FINAL", status: "OFFERED", actorId: user.id, at: new Date().toISOString() }]) } });
        await createNotification({ userId: app.candidateId, type: "OFFER", relatedAppId: app.id, message: "Congratulations! You have been selected. The recruitment team will contact you with the next details." }, tx);
      }
      await tx.auditLog.create({ data: { actorId: user.id, action: "OFFER_BATCH", meta: j({ applicationIds: ids, count: ids.length }) } });
    });
    revalidateCandidateRoutes();
    return { ok: true, count: ids.length };
  } catch (error) { return { error: error instanceof Error ? error.message : "Could not record selection." }; }
}

export async function sendOnsiteInviteAction(applicationId: string, formData: FormData) {
  const user = await requireRole("recruiter", "admin");
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { drive: true, candidate: true, funnel: true },
  });
  if (!app) return { error: "Application not found." };
  if (user.role === "recruiter" && app.drive.ownerId !== user.id) return { error: "Not authorized." };
  const funnel = app.funnelId ? await getFunnel(app.funnelId) : null;
  if (!funnel?.stages.some((stage) => stage.type === "ONSITE" && stage.enabled !== false)) return { error: "This application has no onsite stage." };
  if (app.status === "REJECTED" || app.status === "ARCHIVED") return { error: "An onsite invite cannot be sent for this application." };

  const scheduledRaw = String(formData.get("scheduledAt") || "");
  const scheduledAt = new Date(scheduledRaw);
  const location = String(formData.get("location") || "").trim();
  const locationUrl = String(formData.get("locationUrl") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  if (!scheduledRaw || !Number.isFinite(scheduledAt.getTime())) return { error: "Choose a valid onsite date and time." };
  if (scheduledAt.getTime() <= Date.now()) return { error: "Onsite screening must be scheduled in the future." };
  if (locationUrl) {
    try {
      const url = new URL(locationUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Location link must use HTTPS or HTTP." };
    } catch {
      return { error: "Enter a valid location link." };
    }
  }

  const invite = await prisma.$transaction(async (tx) => {
    await tx.onsiteInvite.updateMany({ where: { applicationId, status: "SENT" }, data: { status: "CANCELLED" } });
    const created = await tx.onsiteInvite.create({ data: { applicationId, scheduledAt, location: location || null, locationUrl: locationUrl || null, notes: notes || null, status: "SENT" } });
    await tx.application.update({
      where: { id: applicationId },
      data: {
        currentStage: "ONSITE",
        phaseReleased: false,
        status: "HOLD",
        stageHistory: j([...(uj<any[]>(app.stageHistory) || []), { stage: "ONSITE", status: "INVITED", at: new Date().toISOString(), scheduledAt: scheduledAt.toISOString(), note: "Onsite screening invitation sent" }]),
      },
    });
    await createNotification({ userId: app.candidateId, type: "ONSITE_INVITE", message: `You are invited to onsite screening on ${scheduledAt.toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC${location ? ` at ${location}` : ""}.`, relatedAppId: applicationId }, tx);
    return created;
  });

  const email = await onsiteInviteEmail({ to: app.candidate.email, name: app.candidate.name, driveName: app.drive.name, scheduledAt, location, locationUrl, notes });
  await prisma.auditLog.create({ data: { actorId: user.id, action: "ONSITE_INVITE_SENT", meta: j({ applicationId, inviteId: invite.id, scheduledAt: scheduledAt.toISOString(), emailSent: email.sent, emailError: email.error }) } });
  revalidateCandidateRoutes();
  return email.sent ? { ok: true, emailSent: true } : { ok: true, emailSent: false, warning: `Invite saved and candidate notified in the portal, but email was not sent: ${email.error || "email provider error"}` };
}

export async function sendOnsiteInvitesAction(applicationIds: string[], details: { scheduledAt: string; location: string; locationUrl?: string; notes?: string }) {
  const user = await requireRole("recruiter", "admin");
  const ids = await managedApplicationIds(user, applicationIds);
  let count = 0;
  let emailFailures = 0;
  const errors: string[] = [];
  for (const id of ids) {
    const formData = new FormData();
    formData.set("scheduledAt", details.scheduledAt);
    formData.set("location", details.location || "");
    formData.set("locationUrl", details.locationUrl || "");
    formData.set("notes", details.notes || "");
    const result = await sendOnsiteInviteAction(id, formData);
    if ("error" in result) errors.push(`${id.slice(0, 8)}: ${result.error}`);
    else {
      count += 1;
      if (!result.emailSent) emailFailures += 1;
    }
  }
  if (errors.length) return { error: `${count} invited. ${errors.join(" ")}`, count, emailFailures };
  return { ok: true, count, emailFailures };
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
  if (!stage || type === "CV_SCREENING" || type === "ONSITE" || type === "FINAL") return { error: "This stage cannot be issued as a test." };
  if (mode === "ONLINE" && app.currentStage !== type) {
    return { error: "Online reissue is limited to this track's current stage. Use an onsite comparison test for a completed historical stage." };
  }
  const last = await prisma.assessmentAttempt.findFirst({ where: { applicationId, type }, orderBy: { attemptNumber: "desc" } });
  const attemptNumber = (last?.attemptNumber ?? 0) + 1;
  const returnStage = app.currentStage && app.currentStage !== type ? app.currentStage : null;
  const returnState = returnStage ? `:RETURN:${returnStage}:${app.phaseReleased ? 1 : 0}:${app.status}` : "";
  await prisma.assessmentAttempt.updateMany({
    where: { applicationId, type, status: { in: ["ACTIVE", "READY"] } },
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
      idempotencyKey: `${applicationId}:${type}:${attemptNumber}:${mode}${returnState}`,
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
    data: { actorId: user.id, action: "RETEST_ISSUED", meta: j({ applicationId, type, mode, attemptNumber, returnStage }) },
  });
  revalidateCandidateRoutes();
  return { ok: true };
}

export async function requestRetestsAction(applicationIds: string[], type: string, mode: "ONLINE" | "ONSITE" = "ONLINE") {
  const user = await requireRole("recruiter", "admin");
  if (mode !== "ONLINE" && mode !== "ONSITE") return { error: "Choose online or onsite delivery." };
  const ids = await managedApplicationIds(user, applicationIds);
  if (!["CCAT", "MTT", "CODING", "ESSAY", "PROMPT", "GAMES"].includes(type)) return { error: "Choose a supported assessment type." };
  const apps = await prisma.application.findMany({ where: { id: { in: ids } }, select: { id: true, funnelId: true } });
  let count = 0;
  const errors: string[] = [];
  for (const app of apps) {
    const formData = new FormData();
    formData.set("type", type);
    formData.set("mode", mode);
    const result = await requestRetestAction(app.id, formData);
    if ("ok" in result && result.ok) count++; else if ("error" in result) errors.push(`${app.id.slice(0, 8)}: ${result.error}`);
  }
  return errors.length ? { error: `${count} issued. ${errors.join(" ")}`, count } : { ok: true, count };
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
