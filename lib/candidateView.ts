import { prisma, uj } from "@/lib/db";
import { trackLabel } from "@/lib/onsiteTrack";
import { authorizeCvAccess, signCvToken } from "@/lib/cv/access";
import { scoresForMode } from "@/lib/scoreModes";
import { computeApplicationTotal } from "@/lib/engine/leaderboard";
import type { CandidateRecord } from "@/lib/engine/search";
import { buildTrackComparison } from "@/lib/trackComparison";

type AnyObj = Record<string, any>;

export function buildCandidateListViews(
  records: CandidateRecord[],
  funnelsByDrive: Map<string, Array<{ id: string; name: string; version: number }>>,
) {
  return records.map((record) => ({
    candidate: { name: record.name, email: record.email },
    application: {
      id: record.id,
      driveId: record.driveId,
      driveName: record.driveName,
      status: record.status,
      funnelId: record.funnelId ?? null,
      funnelName: record.funnelName ?? null,
      trackCount: record.trackCount ?? 1,
      currentStage: record.currentStage ?? null,
      phaseReleased: record.phaseReleased ?? false,
      cvScore: record.cvScore ?? null,
      cvResult: record.cvResult ?? null,
      scores: record.scores ?? {},
      overall: record.overall,
      refreshKey: record.groupRefreshKey ?? record.latestResultId ?? "",
    },
    funnelOptions: funnelsByDrive.get(record.driveId) ?? [],
  }));
}

// Builds the serializable view consumed by <CandidateWorkspace />.
// `app` must already be loaded with: candidate, drive, results(include attempt),
// assessmentAttempts, funnel.
export async function buildCandidateView(app: AnyObj, user: any): Promise<AnyObj> {
  const canManage =
    user?.role === "admin" || (user?.role === "recruiter" && app.drive.ownerId === user.id);
  const canViewCv = await authorizeCvAccess(user, app as any);
  const cvToken = canViewCv && user ? signCvToken(app.id, user.id) : null;

  const funnelStages = app.funnel ? (uj<any[]>(app.funnel.stages) ?? []) : [];
  const enabled = app.funnel ? funnelStages.filter((stage) => stage.enabled !== false).map((stage) => stage.type) : ["CV_SCREENING"];
  const mode = app.trackKey?.startsWith("ONSITE:") ? "ONSITE" : "ONLINE";
  const modeScores = scoresForMode(app.scores, app.results, mode);
  const overall = computeApplicationTotal(modeScores, app.drive.tciWeights, enabled);
  const questionsByBank: Record<string, any[]> = {};
  return {
    candidate: { id: app.candidate.id, name: app.candidate.name, email: app.candidate.email },
    application: {
      id: app.id,
      funnelId: app.funnelId,
      funnelName: app.funnel ? trackLabel(app.funnel.name, app.trackKey) : null,
      funnelDisplayName: app.funnel?.name || "Applicant pool",
      status: app.status,
      appliedAt: (app.appliedAt ?? app.createdAt).toISOString(),
      currentStage: app.currentStage,
      phaseReleased: app.phaseReleased,
      cvResult: app.cvResult,
      cvScore: app.cvScore,
      cvPassThreshold: app.drive.cvPassThreshold,
      cvJobStatus: app.cvJobStatus ?? null,
      scores: modeScores,
      stageHistory: uj(app.stageHistory),
      extractedCv: uj(app.extractedCv),
      driveName: app.drive.name,
      driveId: app.driveId,
      overallScore: overall.total,
      overall,
      scoreMode: app.trackKey?.startsWith("ONSITE:") ? "Onsite" : "Online",
      overallComplete: overall.complete,
    },
    funnelOptions: (app.drive.funnels || []).map((funnel: AnyObj) => ({ id: funnel.id, name: funnel.name || `Funnel v${funnel.version}`, version: funnel.version })),
    funnelStages,
    results: app.results.map((r: AnyObj) => ({
      id: r.id,
      type: r.type,
      mode: r.mode,
      normalized: r.status === "MANUAL_REVIEW" && !r.gradedAt ? null : r.normalized,
      rawScore: r.rawScore,
      maxScore: r.maxScore,
      status: r.status,
      attemptId: r.attemptId,
      answers: r.answers,
      integrityLevel: r.integrityLevel,
      integrityReasons: r.integrityReasons,
      integrityEvents: r.integrityEvents,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
      attemptNumber: r.attempt?.attemptNumber ?? null,
      attemptMode: r.attempt?.mode ?? r.mode,
      attemptStartedAt: r.attempt?.startedAt?.toISOString() ?? null,
      attemptSubmittedAt: r.attempt?.submittedAt?.toISOString() ?? null,
      attemptDeadlineAt: r.attempt?.deadlineAt?.toISOString() ?? null,
    })),
    attempts: app.assessmentAttempts.map((a: AnyObj) => ({
      id: a.id,
      type: a.type,
      mode: a.mode,
      attemptNumber: a.attemptNumber,
      startedAt: a.startedAt?.toISOString() ?? null,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      deadlineAt: a.deadlineAt?.toISOString() ?? null,
      status: a.status,
    })),
    onsiteInvites: (app.onsiteInvites || []).map((invite: AnyObj) => ({
      id: invite.id,
      scheduledAt: invite.scheduledAt.toISOString(),
      location: invite.location,
      locationUrl: invite.locationUrl,
      status: invite.status,
      notes: invite.notes,
      createdAt: invite.createdAt.toISOString(),
    })),
    questionsByBank,
    cvToken,
    canManage: Boolean(canManage),
  };
}

// Async variant: fetches the application (with required includes) then builds.
export async function getCandidateView(applicationId: string, user: any) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      candidate: true,
      drive: { include: { funnels: { where: { published: true }, orderBy: { version: "desc" } } } },
      results: { include: { attempt: true }, orderBy: { createdAt: "asc" } },
      assessmentAttempts: { orderBy: { attemptNumber: "asc" } },
      onsiteInvites: { orderBy: { createdAt: "desc" } },
      funnel: true,
    },
  });
  if (!app) return null;
  if (user?.role === "recruiter" && app.drive.ownerId !== user.id) return null;
  if (user?.role !== "recruiter" && user?.role !== "admin") return null;
  const view = await buildCandidateView(app as AnyObj, user);
  // Populate question banks (needs the async prisma call).
  const banks = Array.from(new Set(app.results.map((result: AnyObj) => result.type)))
    .filter((bank) => ["CODING", "ESSAY", "PROMPT"].includes(bank));
  const [siblingTracks, qRows, cvJob, staffNotes] = await Promise.all([
    prisma.application.findMany({
      where: { candidateId: app.candidateId, driveId: app.driveId },
      include: { funnel: { select: { name: true } }, results: { select: { type: true, mode: true, normalized: true, status: true, gradedAt: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
      orderBy: { createdAt: "asc" },
    }),
    banks.length
      ? prisma.question.findMany({ where: { bank: { in: banks } }, select: { bank: true, number: true, content: true } })
      : Promise.resolve([]),
    prisma.cvJob.findFirst({
      where: { applicationId: app.id },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    }),
    prisma.auditLog.findMany({
      where: { action: "STAFF_NOTE", meta: { contains: app.id } },
      orderBy: { createdAt: "desc" }, take: 50,
      include: { actor: { select: { name: true } } },
    }),
  ]);
  view.staffNotes = staffNotes.filter(note => uj<any>(note.meta)?.applicationId === app.id).map(note => ({
    id: note.id, message: uj<any>(note.meta).message, author: note.actor.name, createdAt: note.createdAt.toISOString(),
  }));
  view.siblingTracks = siblingTracks.map((track) => ({
    id: track.id,
    funnelName: trackLabel(track.funnel?.name || "Drive application", track.trackKey),
    currentStage: track.currentStage,
    status: track.status,
    archived: track.status === "ARCHIVED",
  }));
  const enabled = app.funnel ? (uj<any[]>(app.funnel.stages) || []).filter((stage) => stage.enabled !== false).map((stage) => stage.type) : ["CV_SCREENING"];
  view.trackComparison = buildTrackComparison(app, siblingTracks, app.drive.tciWeights, enabled);
  if (qRows.length) {
    for (const q of qRows) {
      (view.questionsByBank[q.bank] ||= []).push({ number: q.number, content: uj(q.content) });
    }
  }
  view.application.cvJobStatus = cvJob?.status ?? null;
  return view;
}
