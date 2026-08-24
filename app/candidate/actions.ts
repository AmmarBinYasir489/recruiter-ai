"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { prisma, j, uj, getFunnel } from "@/lib/db";
import { requireRole, getCurrentUser } from "@/lib/auth";
import { scoreCcat, decideCcat } from "@/lib/engine/ccat";
import { scoreMtt, decideMtt, type MttAnswer } from "@/lib/engine/mtt";
import { scoreGame, gameAverageToTci } from "@/lib/engine/games";
import { automaticStageTransition, phaseThreshold, type Funnel } from "@/lib/engine/funnel";
import { ALLOWED_CV_TYPES, MAX_CV_BYTES, deleteStoredCv, storeCvFile } from "@/lib/cv/storage";
import { summarizeAssessmentIntegrity, type AssessmentIntegrityEvent } from "@/lib/integrity";
import { gradeSubjective } from "@/lib/ai/gradeSubjective";
import { createNotification } from "@/lib/notifications";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  ENGLISH_SPEAKING_MAX_BYTES,
  ENGLISH_SPEAKING_MAX_SECONDS,
  ENGLISH_SPEAKING_MIN_SECONDS,
  ENGLISH_SPEAKING_QUESTIONS,
  isSpeakingMimeAllowed,
} from "@/lib/englishSpeaking";

function nowIso() {
  return new Date().toISOString();
}

// Prepare pasted text or an uploaded file for the same durable CV queue.
async function readCvInput(formData: FormData): Promise<{ file?: { buf: Buffer; name: string; mime: string }; error?: string }> {
  const f = formData.get("cvFile");
  if (f && typeof f === "object" && "arrayBuffer" in (f as any) && (f as File).size > 0) {
    const file = f as File;
    if (file.size > MAX_CV_BYTES) return { error: "CV must be 10 MB or smaller." };
    const extension = file.name.toLowerCase().split(".").pop();
    const inferred = extension === "pdf" ? "application/pdf"
      : extension === "doc" ? "application/msword"
        : extension === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : extension === "txt" ? "text/plain" : "";
    const mime = file.type || inferred;
    if (!ALLOWED_CV_TYPES.includes(mime)) return { error: "Upload a PDF, DOC, DOCX, or TXT CV." };
    const buf = Buffer.from(await file.arrayBuffer());
    return { file: { buf, name: file.name, mime } };
  }
  const text = String(formData.get("cvText") || "").trim();
  if (text.length < 40) return { error: "Upload your CV or paste at least 40 characters of CV text." };
  const buf = Buffer.from(text, "utf8");
  if (buf.byteLength > MAX_CV_BYTES) return { error: "Pasted CV text is too large." };
  return { file: { buf, name: "pasted-cv.txt", mime: "text/plain" } };
}

export async function applyAction(driveId: string, formData: FormData) {
  const user = await requireRole("candidate");
  const drive = await prisma.drive.findUnique({ where: { id: driveId }, include: { funnels: true } });
  if (!drive || drive.status !== "OPEN") return { error: "Drive is not open for applications." };

  const dup = await prisma.application.findUnique({ where: { candidateId_driveId: { candidateId: user.id, driveId } } });
  if (dup) return { error: "You have already applied to this drive." };

  const funnelId = String(formData.get("funnelId") || "");
  const funnelRow = drive.funnels.find((f) => f.id === funnelId && f.published);
  if (!funnelRow) return { error: "Select a valid application funnel." };
  const funnel = await getFunnel(funnelRow.id);
  if (!funnel) return { error: "Funnel not found." };

  const input = await readCvInput(formData);
  if (input.error || !input.file) return { error: input.error || "Provide a CV." };

  const submittedProfile = {
    name: String(formData.get("name") || user.name).trim(),
    email: user.email,
    phone: String(formData.get("phone") || "").trim(),
    university: String(formData.get("university") || "").trim(),
    degree: String(formData.get("degree") || "").trim(),
    gradYear: Number(formData.get("gradYear")) || undefined,
    gpa: Number(formData.get("gpa")) || undefined,
    linkedin: String(formData.get("linkedin") || "").trim(),
    screening: String(formData.get("screening") || "").trim(),
    source: "APPLICATION_FORM",
  };

  // CV is processed asynchronously (see lib/cv/worker.ts). We commit the
  // application in a PROCESSING state and enqueue a job; the worker scores it,
  // sets gating, and notifies the candidate. This keeps apply non-blocking and
  // makes CV scoring retryable without re-running AI on already-scored jobs.
  const applicationId = randomUUID();
  let storagePath = "";
  try {
    storagePath = await storeCvFile(applicationId, input.file.name, input.file.mime, input.file.buf);
    await prisma.$transaction(async (tx) => {
      await tx.application.create({
        data: {
          id: applicationId,
          candidateId: user.id,
          driveId,
          funnelId: funnelRow.id,
          funnelVersion: funnel.version,
          status: "IN_PROGRESS",
          cvScore: 0,
          cvResult: "PROCESSING",
          extractedCv: j(submittedProfile),
          currentStage: "CV_SCREENING",
          phaseReleased: false,
          stageHistory: j([{ stage: "CV_SCREENING", status: "RECEIVED", at: nowIso(), note: "CV received, queued for screening" }]),
          scores: j({}),
          appliedAt: new Date(),
        },
      });
      await tx.cvJob.create({
        data: {
          applicationId,
          fileName: input.file!.name,
          fileType: input.file!.mime,
          storagePath,
          status: "QUEUED",
          attempts: 0,
        },
      });
      await tx.auditLog.create({ data: { actorId: user.id, action: "APPLY", meta: j({ applicationId, driveId, funnelId: funnelRow.id }) } });
      await createNotification({ userId: user.id, type: "APPLICATION_RECEIVED", message: "Your application was received and your CV is queued for screening.", relatedAppId: applicationId }, tx);
    });
  } catch (error) {
    if (storagePath) await deleteStoredCv(storagePath).catch(() => undefined);
    return { error: error instanceof Error ? `Application could not be submitted: ${error.message}` : "Application could not be submitted. Please try again." };
  }

  redirect(`/candidate/application/${applicationId}`);
}

// ---- Server-authoritative assessment lifecycle ----
// The browser may show a countdown, but validity is decided ONLY by the server
// (startedAt + deadlineAt). A candidate must START before submitting, there is
// at most one ACTIVE attempt, and submissions after the server deadline are
// rejected. Refresh recovers the same in-progress attempt.

async function getSingleActiveAttempt(applicationId: string, type: string) {
  const activeAttempts = await prisma.assessmentAttempt.findMany({
    where: { applicationId, type, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
  });
  const active = activeAttempts[0] ?? null;
  if (activeAttempts.length > 1) {
    await prisma.assessmentAttempt.updateMany({
      where: { id: { in: activeAttempts.slice(1).map((attempt) => attempt.id) }, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });
  }
  return active;
}

async function requireActiveAttempt(applicationId: string, type: string) {
  const active = await getSingleActiveAttempt(applicationId, type);
  if (!active) return { error: "Start the assessment before submitting." } as const;
  if (active.deadlineAt && Date.now() > active.deadlineAt.getTime()) {
    await prisma.assessmentAttempt.update({ where: { id: active.id }, data: { status: "EXPIRED" } });
    return { error: "The assessment deadline has passed." } as const;
  }
  return { attempt: active };
}

export async function startAssessmentAction(applicationId: string, type: string) {
  const user = await requireRole("candidate");
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app || app.candidateId !== user.id) return { error: "Not found." };
  if (app.currentStage !== type || !app.phaseReleased) return { error: "This phase is not available yet." };

  // Prevent multiple active attempts for the same phase.
  const active = await getSingleActiveAttempt(applicationId, type);
  if (active) {
    return { ok: true, attempt: { id: active.id, startedAt: active.startedAt, deadlineAt: active.deadlineAt, attemptNumber: active.attemptNumber } };
  }

  const funnel = await getFunnel(app.funnelId!);
  const stage = funnel?.stages.find((s) => s.type === type);
  const durationMin = stage?.durationMin && stage.durationMin > 0 ? stage.durationMin : null;
  const now = new Date();
  const deadlineAt = durationMin ? new Date(now.getTime() + durationMin * 60000) : null;
  const ready = await prisma.assessmentAttempt.findFirst({
    where: { applicationId, type, status: "READY" },
    orderBy: { attemptNumber: "desc" },
  });
  if (ready) {
    const attempt = await prisma.assessmentAttempt.update({
      where: { id: ready.id },
      data: { status: "ACTIVE", startedAt: now, deadlineAt },
    });
    return { ok: true, attempt: { id: attempt.id, startedAt: attempt.startedAt, deadlineAt: attempt.deadlineAt, attemptNumber: attempt.attemptNumber } };
  }

  // A prior result is accepted only when the recruiter created the READY
  // retest consumed above.
  const existingResult = await prisma.assessmentResult.findFirst({ where: { applicationId, type } });
  if (existingResult) return { error: "This assessment has already been submitted." };

  const last = await prisma.assessmentAttempt.findFirst({ where: { applicationId, type }, orderBy: { attemptNumber: "desc" } });
  const attemptNumber = (last?.attemptNumber ?? 0) + 1;
  const attempt = await prisma.assessmentAttempt.create({
    data: {
      applicationId,
      type,
      attemptNumber,
      startedAt: now,
      deadlineAt,
      status: "ACTIVE",
      idempotencyKey: `${applicationId}:${type}:${attemptNumber}`,
    },
  });
  return { ok: true, attempt: { id: attempt.id, startedAt: attempt.startedAt, deadlineAt: attempt.deadlineAt, attemptNumber: attempt.attemptNumber } };
}

export async function getAssessmentAttemptAction(applicationId: string, type: string) {
  const user = await requireRole("candidate");
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app || app.candidateId !== user.id) return null;
  const active = await getSingleActiveAttempt(applicationId, type);
  if (!active) return null;
  if (active.deadlineAt && Date.now() > active.deadlineAt.getTime()) {
    await prisma.assessmentAttempt.update({ where: { id: active.id }, data: { status: "EXPIRED" } });
    return null;
  }
  return { id: active.id, startedAt: active.startedAt, deadlineAt: active.deadlineAt, attemptNumber: active.attemptNumber };
}

// Builds the integrity payload from the proctoring events captured client-side.
// The HONEST/SUSPICIOUS/PLAGIARIST level is derived server-side, never trusted
// from the client.
const INTEGRITY_EVENT_TYPES = new Set(["TAB_SWITCH", "FULLSCREEN_EXIT", "FULLSCREEN_ENTER", "COPY", "PASTE", "RIGHT_CLICK"]);

function readIntegrity(
  formData: FormData,
  attempt: { id: string; mode: string; startedAt: Date | null; deadlineAt: Date | null },
) {
  let events: AssessmentIntegrityEvent[] = [];
  try {
    const raw = String(formData.get("integrityEvents") || "[]");
    const parsed = JSON.parse(raw);
    const earliest = (attempt.startedAt?.getTime() ?? Date.now()) - 5_000;
    const latest = Math.min(Date.now() + 5_000, attempt.deadlineAt?.getTime() ?? Number.POSITIVE_INFINITY);
    if (Array.isArray(parsed)) {
      events = parsed.slice(0, 200).flatMap((event): AssessmentIntegrityEvent[] => {
        if (!event || typeof event !== "object" || !INTEGRITY_EVENT_TYPES.has(String(event.eventType))) return [];
        const timestamp = new Date(String(event.timestamp || ""));
        const timestampMs = timestamp.getTime();
        if (!Number.isFinite(timestampMs) || timestampMs < earliest || timestampMs > latest) return [];
        return [{ eventType: String(event.eventType), timestamp: timestamp.toISOString() }];
      });
    }
  } catch {
    events = [];
  }
  const summary = summarizeAssessmentIntegrity(events);
  return {
    attemptId: attempt.id,
    mode: attempt.mode,
    integrityEvents: j(events),
    integrityLevel: summary.level,
    integrityReasons: j(summary.reasons),
  };
}

// Auto-graded tests: CCAT and MTT. MTT supports both retained multiple-choice
// banks and locally generated numeric questions.
export async function submitAutoTestAction(applicationId: string, type: "CCAT" | "MTT", formData: FormData) {
  const user = await requireRole("candidate");
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app || app.candidateId !== user.id) return { error: "Not found." };
  if (app.currentStage !== type || !app.phaseReleased) return { error: "This phase is not available yet." };
  const chk = await requireActiveAttempt(applicationId, type);
  if ("error" in chk) return { error: chk.error };
  const funnel = await getFunnel(app.funnelId!);
  if (!funnel) return { error: "Funnel missing." };
  const threshold = phaseThreshold(funnel, type);
  const integrity = readIntegrity(formData, chk.attempt);

  const questions = await prisma.question.findMany({ where: { bank: type } });
  if (type === "CCAT") {
    const items: any[] = [];
    let correct = 0;
    for (const q of questions) {
      const content = uj<{ correctAnswerIndex: number }>(q.content);
      const ansRaw = formData.get(`a${q.number}`);
      const ans = ansRaw === null ? null : Number(ansRaw);
      const isCorrect = ans !== null && ans === content.correctAnswerIndex;
      if (isCorrect) correct++;
      items.push({ number: q.number, selected: ans, correctAnswerIndex: content.correctAnswerIndex, correct: isCorrect });
    }
    const pct = scoreCcat(correct, questions.length);
    const result = decideCcat(pct, threshold);
    await storeResult(app, app.candidateId, "CCAT", correct, questions.length, pct, result, { correct, items }, funnel, integrity);
    redirect(`/candidate/application/${applicationId}`);
  }
  const items: any[] = [];
  const answers: MttAnswer[] = [];
  for (const q of questions) {
    const content = uj<{ answer?: number; correctAnswerIndex?: number; options?: string[] }>(q.content);
    const valRaw = formData.get(`a${q.number}`);
    let status: "correct" | "wrong" | "unanswered";
    let value: number | null;
    if (valRaw === null || valRaw === "") {
      status = "unanswered";
      value = null;
    } else {
      value = Number(valRaw);
      const expected = Array.isArray(content.options) ? content.correctAnswerIndex : content.answer;
      status = value === expected ? "correct" : "wrong";
    }
    answers.push(status);
    items.push({ number: q.number, value, correctAnswer: content.answer, correctAnswerIndex: content.correctAnswerIndex, status });
  }
  const { raw, percentage } = scoreMtt(answers);
  const result = decideMtt(percentage, threshold);
  await storeResult(app, app.candidateId, "MTT", raw, 120, percentage, result, { raw, answers, items }, funnel, integrity);
  redirect(`/candidate/application/${applicationId}`);
}

export async function submitSubjectiveAction(applicationId: string, type: string, formData: FormData) {
  const user = await requireRole("candidate");
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app || app.candidateId !== user.id) return { error: "Not found." };
  if (app.currentStage !== type || !app.phaseReleased) return { error: "This phase is not available yet." };
  const chk = await requireActiveAttempt(applicationId, type);
  if ("error" in chk) return { error: chk.error };
  const questions = await prisma.question.findMany({ where: { bank: type }, orderBy: { number: "asc" } });
  let payload: any;
  if (questions.length > 0) {
    const items = questions.map((q) => {
      const c = uj<any>(q.content) || {};
      const answer = String(formData.get(`answer_${q.number}`) || "").trim();
      const maxScore = type === "ESSAY" ? (c.section === "DESCRIPTIVE" ? 20 : 10) : 10;
      return { number: q.number, section: c.section ?? null, prompt: c.prompt ?? c.text ?? c.question ?? "", answer, maxScore };
    });
    payload = { items, submittedAt: nowIso() };
  } else {
    payload = { text: String(formData.get("answer") || "").trim(), submittedAt: nowIso() };
  }
  const integrity = readIntegrity(formData, chk.attempt);
  // AI may provide a reviewer aid, but subjective assessments remain manual.
  // An AI suggestion never changes the result state or advances a candidate.
  let aiScored = false;
  let aiScore: number | null = null;
  let aiNotes = "AI reviewer aid was unavailable; human review is required.";
  let storedPayload = payload;
  try {
    const supportsAiReviewerAid = type === "ESSAY" || type === "CODING" || type === "PROMPT";
    const gradingItems = payload.items?.length
      ? payload.items
      : [{ number: 1, prompt: `${type} submission`, answer: payload.text || "", maxScore: 100 }];
    if (supportsAiReviewerAid && gradingItems.length) {
      const graded = await gradeSubjective(type, gradingItems);
      if (graded) {
        const merged = gradingItems.map((it: any) => {
          const g = graded.questions.find((x) => x.number === it.number);
          return { ...it, score: g?.score ?? 0, feedback: g?.feedback ?? "" };
        });
        const perQ = merged.map((m: any) => `Q${m.number}: ${m.score}/${m.maxScore} — ${m.feedback}`).join("\n");
        storedPayload = { items: merged, submittedAt: payload.submittedAt };
        aiNotes = `AI grading (${type}) — reviewer aid only; per-question:\n${perQ}`;
        aiScored = true;
        aiScore = graded.normalized;
      }
    }
  } catch (error) {
    aiNotes = `AI reviewer aid failed: ${error instanceof Error ? error.message.slice(0, 300) : "unknown error"}. Human review is required.`;
  }

  const scores = uj<Record<string, number>>(app.scores) || {};
  if (aiScored && aiScore != null) scores[type] = aiScore;
  await prisma.$transaction(async (tx) => {
    await tx.assessmentResult.create({
      data: {
        applicationId, type, attemptId: chk.attempt.id, mode: chk.attempt.mode,
        rawScore: 0, maxScore: 100, normalized: aiScore ?? 0, status: "MANUAL_REVIEW",
        answers: j(storedPayload), notes: aiNotes, gradedAt: aiScored ? new Date() : null,
        integrityEvents: integrity.integrityEvents, integrityLevel: integrity.integrityLevel,
        integrityReasons: integrity.integrityReasons,
      },
    });
    await tx.application.update({
      where: { id: applicationId },
      data: {
        scores: j(scores), currentStage: type, phaseReleased: false, status: "IN_PROGRESS",
        stageHistory: j([...(uj<any[]>(app.stageHistory) || []), { stage: type, status: "MANUAL_REVIEW", at: nowIso(), note: aiScored ? "AI score prepared as a reviewer aid; human review required" : "Submitted for reviewer grading" }]),
      },
    });
    await tx.assessmentAttempt.update({ where: { id: chk.attempt.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
    await createNotification({
      userId: app.candidateId,
      type: "SUBMISSION_RECEIVED",
      message: aiScored
        ? `Your ${type} submission is awaiting human review. An AI-assisted score (${aiScore ?? 0}/100) is available to the reviewer.`
        : `Your ${type} submission was received and is awaiting review.`,
      relatedAppId: app.id,
    }, tx);
    await tx.auditLog.create({ data: { actorId: user.id, action: "AI_REVIEW_AID", meta: j({ applicationId, type, outcome: aiScored ? "SCORED" : "FALLBACK_TO_HUMAN", normalized: aiScore }) } });
  });
  redirect(`/candidate/application/${applicationId}`);
}

export async function submitEnglishSpeakingAction(applicationId: string, formData: FormData) {
  const user = await requireRole("candidate");
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app || app.candidateId !== user.id) return { error: "Not found." };
  if (app.currentStage !== "ENGLISH_SPEAKING" || !app.phaseReleased) return { error: "This phase is not available yet." };
  const chk = await requireActiveAttempt(applicationId, "ENGLISH_SPEAKING");
  if ("error" in chk) return { error: chk.error };
  if (String(formData.get("attemptId") || "") !== chk.attempt.id) return { error: "Assessment attempt mismatch." };

  const bucket = String(formData.get("bucket") || "");
  const expectedBucket = process.env.SUPABASE_ASSESSMENT_BUCKET || "assessment-recordings";
  const storagePath = String(formData.get("storagePath") || "");
  const mimeType = String(formData.get("mimeType") || "");
  const byteSize = Math.round(Number(formData.get("byteSize") || 0));
  const durationSeconds = Math.round(Number(formData.get("durationSeconds") || 0));
  if (bucket !== expectedBucket || !storagePath.startsWith(`applications/${applicationId}/${chk.attempt.id}/`)) return { error: "Invalid recording location." };
  if (!isSpeakingMimeAllowed(mimeType) || byteSize < 1 || byteSize > ENGLISH_SPEAKING_MAX_BYTES) return { error: "Invalid recording file." };
  if (durationSeconds < ENGLISH_SPEAKING_MIN_SECONDS || durationSeconds > ENGLISH_SPEAKING_MAX_SECONDS + 5) return { error: "Recording duration must be between 2 and 4 minutes." };

  const fileName = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const prefix = storagePath.slice(0, storagePath.lastIndexOf("/"));
  const { data: objects, error: storageError } = await getSupabaseAdmin().storage.from(bucket).list(prefix, { search: fileName, limit: 1 });
  if (storageError || !objects?.some((object) => object.name === fileName)) return { error: "The uploaded recording could not be verified." };

  const integrity = readIntegrity(formData, chk.attempt);
  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.assessmentResult.create({
      data: {
        applicationId,
        attemptId: chk.attempt.id,
        type: "ENGLISH_SPEAKING",
        mode: chk.attempt.mode,
        status: "MANUAL_REVIEW",
        answers: j({ bucket, storagePath, mimeType, byteSize, durationSeconds, questions: ENGLISH_SPEAKING_QUESTIONS }),
        integrityEvents: integrity.integrityEvents,
        integrityLevel: integrity.integrityLevel,
        integrityReasons: integrity.integrityReasons,
      },
    });
    await tx.assessmentAttempt.update({ where: { id: chk.attempt.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
    await tx.application.update({
      where: { id: applicationId },
      data: {
        currentStage: "ENGLISH_SPEAKING",
        phaseReleased: false,
        status: "IN_PROGRESS",
        stageHistory: j([...(uj<any[]>(app.stageHistory) || []), { stage: "ENGLISH_SPEAKING", status: "MANUAL_REVIEW", at: nowIso(), note: "Voice note submitted for human review" }]),
      },
    });
    await createNotification({ userId: app.candidateId, type: "SUBMISSION_RECEIVED", message: "Your English speaking voice note was received and is awaiting human review.", relatedAppId: app.id }, tx);
    return created;
  });
  await prisma.auditLog.create({ data: { actorId: user.id, action: "ENGLISH_SPEAKING_SUBMITTED", meta: j({ applicationId, resultId: result.id, durationSeconds }) } });
  redirect(`/candidate/application/${applicationId}`);
}

export async function submitGameAction(applicationId: string, formData: FormData) {
  const user = await requireRole("candidate");
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app || app.candidateId !== user.id) return { error: "Not found." };
  if (app.currentStage !== "GAMES" || !app.phaseReleased) return { error: "This phase is not available yet." };
  const chk = await requireActiveAttempt(applicationId, "GAMES");
  if ("error" in chk) return { error: chk.error };
  const funnel = await getFunnel(app.funnelId!);
  if (!funnel) return { error: "Funnel missing." };
  const threshold = phaseThreshold(funnel, "GAMES");
  const integrity = readIntegrity(formData, chk.attempt);
  const total = 12;
  let found = 0;
  for (let i = 1; i <= 5; i++) if (formData.get(`w${i}`) === "1") found++;
  const sudokuAnswers = [2, 1, 3, 4];
  sudokuAnswers.forEach((answer, index) => { if (Number(formData.get(`sudoku_${index + 1}`)) === answer) found++; });
  const crosswordAnswers = ["CODE", "DATA", "AI"];
  crosswordAnswers.forEach((answer, index) => { if (String(formData.get(`crossword_${index + 1}`) || "").trim().toUpperCase() === answer) found++; });
  const accuracy = total ? (found / total) * 100 : 0;
  const result0to10 = scoreGame(accuracy, accuracy, "MEDIUM");
  const normalized = gameAverageToTci(result0to10);
  // Games pass when above the funnel threshold.
  const result = normalized >= threshold ? "PASS" : "FAIL";
  await storeResult(app, app.candidateId, "GAMES", found, total, normalized, result, { found, total, result0to10 }, funnel, integrity);
  redirect(`/candidate/application/${applicationId}`);
}

// ---- helpers ----
type IntegrityPayload = {
  attemptId: string;
  mode: string;
  integrityEvents: string;
  integrityLevel: string;
  integrityReasons: string;
};

async function storeResult(
  app: { id: string; driveId: string; currentStage?: string | null; scores: string | null; stageHistory: string; candidateId: string },
  candidateId: string,
  type: string,
  raw: number,
  max: number,
  normalized: number,
  _suggestedResult: string,
  answers: unknown,
  funnel: Funnel,
  integrity: IntegrityPayload,
) {
  const isAutomatic = type === "CCAT" || type === "MTT";
  const decision = _suggestedResult === "PASS" ? "PASS" : "FAIL";
  const transition = isAutomatic
    ? automaticStageTransition(funnel, type as "CCAT" | "MTT", decision)
    : null;
  const scores = uj<Record<string, number>>(app.scores) || {};
  scores[type] = normalized;
  await prisma.$transaction(async (tx) => {
    await tx.assessmentResult.create({
      data: {
        applicationId: app.id, type, attemptId: integrity.attemptId, mode: integrity.mode,
        rawScore: raw, maxScore: max, normalized, status: isAutomatic ? decision : "PENDING",
        answers: j(answers), integrityEvents: integrity.integrityEvents,
        integrityLevel: integrity.integrityLevel, integrityReasons: integrity.integrityReasons,
      },
    });
    await tx.application.update({
      where: { id: app.id },
      data: {
        scores: j(scores),
        stageHistory: j([
          ...(uj<any[]>(app.stageHistory) || []),
          {
            stage: type, status: isAutomatic ? decision : "SCORED", at: nowIso(),
            note: isAutomatic
              ? `${type} ${normalized}/100 — automatic threshold result: ${decision}${transition?.nextStageName ? `; ${transition.nextStageName} released` : ""}`
              : `${type} ${normalized}/100; awaiting recruiter threshold decision`,
          },
        ]),
        currentStage: transition?.currentStage ?? type,
        phaseReleased: transition?.phaseReleased ?? false,
        status: transition?.applicationStatus ?? "IN_PROGRESS",
      },
    });
    await tx.assessmentAttempt.update({ where: { id: integrity.attemptId }, data: { status: "SUBMITTED", submittedAt: new Date() } });
    await createNotification({
      userId: candidateId,
      type: "SCORE_READY",
      message: isAutomatic
        ? `Your ${type} result is ${decision} (${normalized}/100).${transition?.nextStageName ? ` ${transition.nextStageName} is now available.` : ""}`
        : `Your ${type} result is ready (${normalized}/100). The recruitment team will review it and notify you about the next step.`,
      relatedAppId: app.id,
    }, tx);
  });
}

export async function markNotificationsReadAction() {
  const user = await requireRole("candidate");
  await prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
}
