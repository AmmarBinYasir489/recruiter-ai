import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { signCvToken } from "@/lib/cv/access";
import { resultForCurrentStage } from "@/lib/candidateStage";
import { candidateCanSeeScore, candidateSafeNotification } from "@/lib/candidatePrivacy";
import { Card, SectionTitle, decisionBadge, statusBadge, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  CV_SCREENING: "CV screening", CCAT: "CCAT / IQ", MTT: "Math thinking", CODING: "Coding",
  ESSAY: "Essay", PROMPT: "Prompt engineering", ENGLISH_SPEAKING: "English speaking", GAMES: "Games", RAT: "Research test",
  MANUAL_REVIEW: "Manual review", ONSITE: "Onsite", FINAL: "Final decision",
};

export default async function ApplicationPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const user = await getCurrentUser();
  if (!user) return null;
  const app = await prisma.application.findUnique({
    where: { id: params.id },
    include: { drive: true, results: { orderBy: { createdAt: "desc" } } },
  });
  if (!app || app.candidateId !== user.id) return <Card>Application not found.</Card>;

  const notes = await prisma.notification.findMany({
    where: { userId: user.id, relatedAppId: app.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 8,
  });
  const currentStage = app.currentStage || "CV_SCREENING";
  const currentResult = resultForCurrentStage(app.results, currentStage);
  const cvToken = signCvToken(app.id, user.id);
  const processing = app.cvResult === "PROCESSING";
  const currentScore = candidateCanSeeScore(currentStage)
    ? (currentStage === "CV_SCREENING" ? app.cvScore : currentResult?.normalized)
    : null;
  const currentDecision = currentStage === "CV_SCREENING" ? app.cvResult : currentResult?.status;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-600">Your application</p>
          <h1 className="text-2xl font-bold text-ink-900">{app.drive.name}</h1>
          <p className="mt-1 text-sm text-slate-500">Reference {app.id.slice(0, 8).toUpperCase()}</p>
        </div>
        {statusBadge(app.status)}
      </div>

      <section aria-labelledby="current-step" className="mb-8 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Current step</p>
        <h2 id="current-step" className="mt-1 text-2xl font-bold text-ink-900">{STAGE_LABEL[currentStage] || currentStage}</h2>

        {currentScore != null && !processing && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-3xl font-black text-ink-900">{Math.round(currentScore)}<span className="text-base text-slate-400">/100</span></span>
            {decisionBadge(currentDecision || "PENDING")}
          </div>
        )}

        <div className="mt-4">
          {processing ? (
            <p className="text-sm text-slate-600" role="status">Your CV is securely queued for scoring. This page updates automatically.</p>
          ) : app.phaseReleased && currentStage !== "FINAL" ? (
            <>
              <p className="mb-3 text-sm text-slate-600">This assessment is ready. Your timer starts only when you begin.</p>
              <LinkButton href={`/candidate/test/${app.id}/${currentStage}`} className="btn-primary">
                Start {STAGE_LABEL[currentStage] || currentStage} →
              </LinkButton>
            </>
          ) : currentDecision === "PENDING" || app.cvResult === "PENDING" ? (
            <p className="text-sm font-medium text-amber-700">Your score is ready. The recruitment team is reviewing the threshold decision; no action is needed from you.</p>
          ) : app.status === "REJECTED" ? (
            <p className="text-sm font-medium text-rose-700">Your application was not selected. Please see the latest update below.</p>
          ) : app.status === "OFFERED" || app.status === "HIRED" ? (
            <p className="text-sm font-medium text-emerald-700">Congratulations — you have been selected. The recruitment team will contact you with the next details.</p>
          ) : currentStage === "FINAL" ? (
            <p className="text-sm font-medium text-amber-700">Your assessments are complete and your final decision is pending.</p>
          ) : (
            <p className="text-sm font-medium text-amber-700">Waiting for the recruitment team to release your next action. You’ll be notified here automatically.</p>
          )}
        </div>
      </section>

      <SectionTitle>CV score</SectionTitle>
      <Card className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">CV score</p>
            <p className="text-2xl font-black text-ink-900">{processing ? "Processing" : `${app.cvScore ?? "—"}/100`}</p>
          </div>
          <a href={`/api/cv/${app.id}?token=${cvToken}`} className="btn-outline text-sm">Download your CV</a>
        </div>
      </Card>

      <SectionTitle>Latest updates</SectionTitle>
      <div className="space-y-2" aria-live="polite">
        {notes.length === 0 ? (
          <Card className="text-sm text-slate-500">No updates yet. This page refreshes automatically.</Card>
        ) : notes.map((note) => (
          <Card key={note.id} className={`text-sm ${note.read ? "text-slate-600" : "border-brand-200 bg-brand-50 text-ink-900"}`}>
            <div className="flex items-start justify-between gap-3">
              <p>{note.type === "CV_SCORED" || note.type === "CV_THRESHOLD" ? `Your CV screening is complete. Your current score is ${app.cvScore}/100.` : candidateSafeNotification(note.message)}</p>
              {!note.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
            </div>
            <p className="mt-1 text-xs text-slate-400">{note.createdAt.toLocaleString()}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
