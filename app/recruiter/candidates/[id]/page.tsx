import { prisma, uj } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { authorizeCvAccess, signCvToken } from "@/lib/cv/access";
import { CandidateWorkspace } from "@/components/candidate/CandidateWorkspace";

export const dynamic = "force-dynamic";

export default async function CandidateDetail({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const app = await prisma.application.findUnique({
    where: { id: params.id },
    include: {
      candidate: true,
      drive: true,
      results: { include: { attempt: true }, orderBy: { createdAt: "asc" } },
      assessmentAttempts: { orderBy: { attemptNumber: "asc" } },
      onsiteInvites: { orderBy: { createdAt: "desc" } },
      funnel: true,
    },
  });
  if (!app) return <div className="card">Application not found.</div>;

  const user = await getCurrentUser();
  const canManage =
    user?.role === "admin" || (user?.role === "recruiter" && app.drive.ownerId === user.id);
  if (!canManage) return <div className="card">Application not found.</div>;
  const canViewCv = await authorizeCvAccess(user, app);
  const cvToken = canViewCv && user ? signCvToken(app.id, user.id) : null;

  const funnelStages = app.funnel ? (uj<any[]>(app.funnel.stages) ?? []) : [];
  const banks = Array.from(
    new Set([...funnelStages.map((s) => s.type), ...app.results.map((r) => r.type)]),
  ).filter((b) => ["CCAT", "MTT", "CODING", "ESSAY", "PROMPT"].includes(b));
  const qRows = banks.length ? await prisma.question.findMany({ where: { bank: { in: banks } } }) : [];
  const questionsByBank: Record<string, any[]> = {};
  for (const q of qRows) {
    (questionsByBank[q.bank] ||= []).push({ number: q.number, content: uj(q.content) });
  }
  const cvJob = await prisma.cvJob.findFirst({ where: { applicationId: app.id }, orderBy: { createdAt: "desc" } });

  const view = {
    candidate: { id: app.candidate.id, name: app.candidate.name, email: app.candidate.email },
    application: {
      id: app.id,
      status: app.status,
      appliedAt: (app.appliedAt ?? app.createdAt).toISOString(),
      currentStage: app.currentStage,
      phaseReleased: app.phaseReleased,
      cvResult: app.cvResult,
      cvScore: app.cvScore,
      cvPassThreshold: app.drive.cvPassThreshold,
      cvJobStatus: cvJob?.status ?? null,
      scores: uj(app.scores),
      stageHistory: uj(app.stageHistory),
      extractedCv: uj(app.extractedCv),
      driveName: app.drive.name,
    },
    funnelStages,
    results: app.results.map((r) => ({
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
    attempts: app.assessmentAttempts.map((a) => ({
      id: a.id,
      type: a.type,
      mode: a.mode,
      attemptNumber: a.attemptNumber,
      startedAt: a.startedAt?.toISOString() ?? null,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      deadlineAt: a.deadlineAt?.toISOString() ?? null,
      status: a.status,
    })),
    onsiteInvites: app.onsiteInvites.map((invite) => ({
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

  return <CandidateWorkspace view={view} />;
}
