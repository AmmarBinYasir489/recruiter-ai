import { prisma, uj } from "@/lib/db";
import { authorizeCvAccess, signCvToken } from "@/lib/cv/access";

type AnyObj = Record<string, any>;

// Builds the serializable view consumed by <CandidateWorkspace />.
// `app` must already be loaded with: candidate, drive, results(include attempt),
// assessmentAttempts, funnel.
export async function buildCandidateView(app: AnyObj, user: any): Promise<AnyObj> {
  const canManage =
    user?.role === "admin" || (user?.role === "recruiter" && app.drive.ownerId === user.id);
  const canViewCv = await authorizeCvAccess(user, app as any);
  const cvToken = canViewCv && user ? signCvToken(app.id, user.id) : null;

  const funnelStages = app.funnel ? (uj<any[]>(app.funnel.stages) ?? []) : [];
  const questionsByBank: Record<string, any[]> = {};
  return {
    candidate: { id: app.candidate.id, name: app.candidate.name, email: app.candidate.email },
    application: {
      id: app.id,
      funnelId: app.funnelId,
      status: app.status,
      appliedAt: (app.appliedAt ?? app.createdAt).toISOString(),
      currentStage: app.currentStage,
      phaseReleased: app.phaseReleased,
      cvResult: app.cvResult,
      cvScore: app.cvScore,
      cvPassThreshold: app.drive.cvPassThreshold,
      cvJobStatus: app.cvJobStatus ?? null,
      scores: uj(app.scores),
      stageHistory: uj(app.stageHistory),
      extractedCv: uj(app.extractedCv),
      driveName: app.drive.name,
    },
    funnelStages,
    results: app.results.map((r: AnyObj) => ({
      id: r.id,
      type: r.type,
      mode: r.mode,
      normalized: r.normalized,
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
      drive: true,
      results: { include: { attempt: true }, orderBy: { createdAt: "asc" } },
      assessmentAttempts: { orderBy: { attemptNumber: "asc" } },
      funnel: true,
    },
  });
  if (!app) return null;
  if (user?.role === "recruiter" && app.drive.ownerId !== user.id) return null;
  if (user?.role !== "recruiter" && user?.role !== "admin") return null;
  const view = await buildCandidateView(app as AnyObj, user);

  // Populate question banks (needs the async prisma call).
  const funnelStages = app.funnel ? (uj<any[]>(app.funnel.stages) ?? []) : [];
  const banks = Array.from(
    new Set([...funnelStages.map((s: AnyObj) => s.type), ...app.results.map((r: AnyObj) => r.type)]),
  ).filter((b) => ["CCAT", "MTT", "CODING", "ESSAY", "PROMPT"].includes(b));
  if (banks.length) {
    const qRows = await prisma.question.findMany({ where: { bank: { in: banks } } });
    for (const q of qRows) {
      (view.questionsByBank[q.bank] ||= []).push({ number: q.number, content: uj(q.content) });
    }
  }
  // cvJob status for the badge.
  const cvJob = await prisma.cvJob.findFirst({ where: { applicationId: app.id }, orderBy: { createdAt: "desc" } });
  view.application.cvJobStatus = cvJob?.status ?? null;
  return view;
}
