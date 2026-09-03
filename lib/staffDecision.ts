import type { Prisma } from "@prisma/client";
import { j, uj } from "@/lib/db";
import { firstAssessmentStage, nextEnabledStage, type Funnel } from "@/lib/engine/funnel";
import { isOnsiteTrack, onsiteNext } from "@/lib/onsiteTrack";
import { createNotification } from "@/lib/notifications";

export type StaffDecision = "HOLD" | "PASS" | "FAIL";
const terminal = ["ARCHIVED", "REJECTED", "OFFERED", "HIRED"];

// Shared by individual, bulk and threshold actions. Called inside a transaction.
// expectedStage prevents stale cohort pages from approving a different phase.
export async function decideApplication(tx: Prisma.TransactionClient, applicationId: string, actorId: string, decision: StaffDecision, expectedStage?: string) {
  const app = await tx.application.findUnique({ where: { id: applicationId }, include: { funnel: true } });
  if (!app || terminal.includes(app.status)) throw new Error("This application is no longer actionable.");
  const type = app.currentStage || "CV_SCREENING";
  if (expectedStage && expectedStage !== type) throw new Error("The current phase changed. Refresh before deciding.");
  if (type === "FINAL" && decision === "PASS") throw new Error("Use the separate final hiring decision.");
  const pendingAttempt = await tx.assessmentAttempt.findFirst({ where: { applicationId, type, status: { in: ["ACTIVE", "READY"] } } });
  const latest = type === "CV_SCREENING" ? null : await tx.assessmentResult.findFirst({ where: { applicationId, type }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const scores = uj<Record<string, number>>(app.scores) || {};
  const scored = type === "CV_SCREENING"
    ? app.cvScore != null && !["PROCESSING", "FAILED"].includes(app.cvResult || "")
    : latest && (latest.gradedAt != null || latest.status !== "MANUAL_REVIEW");
  if (decision === "PASS" && (pendingAttempt || (!scored && type !== "ONSITE"))) {
    throw new Error("Pass requires a completed, scored current attempt. Grade or complete the pending test first.");
  }
  const funnel: Funnel | null = app.funnel ? { ...app.funnel, stages: uj(app.funnel.stages) } : null;
  let currentStage = type, phaseReleased = false, status = decision === "FAIL" ? "REJECTED" : "HOLD";
  let message = decision === "FAIL" ? "Your application was not selected. Thank you for your time." : "Your submission is under review. No action is needed from you.";
  if (decision === "PASS") {
    if (latest) scores[type] = latest.normalized;
    else if (type === "CV_SCREENING" && app.cvScore != null) scores.CV_SCREENING = app.cvScore;
    const onsite = funnel && isOnsiteTrack(app.trackKey) ? onsiteNext(funnel, type === "CV_SCREENING" ? undefined : type) : null;
    const next = funnel ? type === "CV_SCREENING" ? firstAssessmentStage(funnel) : nextEnabledStage(funnel, { type: type as any }) : null;
    if (onsite) {
      currentStage = onsite.currentStage; phaseReleased = onsite.phaseReleased; status = onsite.applicationStatus;
    } else if (next) {
      currentStage = next.type;
      // A scheduled stage is authorized here; the start endpoint enforces its opening time.
      phaseReleased = !["FINAL", "ONSITE"].includes(next.type);
      status = phaseReleased ? "IN_PROGRESS" : "HOLD";
    } else if (funnel) currentStage = "FINAL";
    message = currentStage === "FINAL" ? "Your assessments are complete. Your final decision is pending."
      : currentStage === "ONSITE" ? "You have been selected for onsite screening. The recruitment team will send the details."
      : currentStage !== type ? `Your next assessment, ${next?.name || onsite?.nextStageName || currentStage}, has been approved. Open your application for availability.`
      : "Your application review is complete. The recruitment team will contact you with the next step.";
  }
  // Compare the state read above, so repeated/stale requests cannot skip a phase.
  const updated = await tx.application.updateMany({ where: { id: app.id, currentStage: app.currentStage, status: app.status, phaseReleased: app.phaseReleased, stageHistory: app.stageHistory }, data: {
    currentStage, status, phaseReleased, scores: j(scores),
    ...(type === "CV_SCREENING" ? { cvResult: decision } : {}),
    stageHistory: j([...(uj<any[]>(app.stageHistory) || []), { stage: type, status: decision, at: new Date().toISOString(), actorId, next: currentStage }]),
  } });
  if (updated.count !== 1) throw new Error("The application changed. Refresh before deciding.");
  if (latest && !(decision === "HOLD" && latest.status === "MANUAL_REVIEW" && !latest.gradedAt)) await tx.assessmentResult.update({ where: { id: latest.id }, data: { status: decision === "HOLD" ? "PENDING" : decision } });
  if (decision === "FAIL") await tx.assessmentAttempt.updateMany({ where: { applicationId, status: { in: ["ACTIVE", "READY"] } }, data: { status: "CANCELLED" } });
  if (decision !== "HOLD" || app.status !== "HOLD") await createNotification({ userId: app.candidateId, type: decision === "PASS" && currentStage !== type ? "PHASE_RELEASED" : "STAFF_DECISION", message, relatedAppId: app.id }, tx);
  await tx.auditLog.create({ data: { actorId, action: "STAFF_DECISION", meta: j({ applicationId, phase: type, decision, next: currentStage }) } });
  return { ok: true as const };
}
