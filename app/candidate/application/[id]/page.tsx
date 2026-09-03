import { prisma, uj } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { signCvToken } from "@/lib/cv/access";
import { resultForCurrentStage } from "@/lib/candidateStage";
import { candidateSafeNotification } from "@/lib/candidatePrivacy";
import { trackLabel } from "@/lib/onsiteTrack";
import { markNotificationsReadAction } from "@/app/candidate/actions";
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
    include: { drive: true, funnel: true, results: { orderBy: { createdAt: "desc" } }, onsiteInvites: { orderBy: { createdAt: "desc" }, take: 1 }, cvJobs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } } },
  });
  if (!app || app.candidateId !== user.id || app.status === "ARCHIVED") return <Card>Application not found.</Card>;

  const [notes, siblingTracks] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, relatedAppId: app.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 3,
    }),
    prisma.application.findMany({
      where: { candidateId: user.id, driveId: app.driveId, status: { not: "ARCHIVED" } },
      include: { funnel: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const currentStage = app.currentStage || "CV_SCREENING";
  const currentResult = resultForCurrentStage(app.results, currentStage);
  const cvToken = signCvToken(app.id, user.id);
  const extractionFailed = app.cvJobs[0]?.status === "FAILED";
  const processing = app.cvResult === "PROCESSING" && !extractionFailed;
  const currentDecision = currentStage === "CV_SCREENING" ? null : currentResult?.status;
  const visibleDecision = app.status === "HOLD" && currentDecision === "FAIL" ? null : currentDecision;
  const currentStageConfig = app.funnel ? (uj<any[]>(app.funnel.stages) || []).find((stage) => stage.type === currentStage) : null;
  const opensAt = currentStageConfig?.opensAt ? new Date(currentStageConfig.opensAt) : null;
  const scheduled = Boolean(opensAt && Number.isFinite(opensAt.getTime()) && opensAt.getTime() > Date.now());
  const phaseAvailable = app.phaseReleased || Boolean(opensAt && Number.isFinite(opensAt.getTime()) && opensAt.getTime() <= Date.now());
  const onsiteInvite = app.onsiteInvites[0] || null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-600">Your application</p>
          <h1 className="text-2xl font-bold text-ink-900">{app.drive.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {app.funnel?.name ? `${trackLabel(app.funnel.name, app.trackKey)} · ` : ""}Reference {app.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        {statusBadge(app.status)}
      </div>

      {siblingTracks.length > 1 && (
        <section aria-labelledby="assessment-tracks" className="mb-6">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="assessment-tracks" className="font-bold text-ink-900">Your assessment tracks</h2>
              <p className="text-sm text-slate-500">You are participating in {siblingTracks.length} funnels for this drive. Each keeps its own progress and results.</p>
            </div>
            <span className="badge-info">{siblingTracks.length} funnels</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {siblingTracks.map((track) => {
              const active = track.id === app.id;
              return (
                <LinkButton
                  key={track.id}
                  href={`/candidate/application/${track.id}`}
                  className={active ? "btn-primary justify-start" : "btn-outline justify-start"}
                >
                  {trackLabel(track.funnel?.name || "Drive application", track.trackKey)} · {STAGE_LABEL[track.currentStage || ""] || track.currentStage || "Review"}
                </LinkButton>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="current-step" className="mb-8 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Current step</p>
        <h2 id="current-step" className="mt-1 text-2xl font-bold text-ink-900">{STAGE_LABEL[currentStage] || currentStage}</h2>

        {!processing && visibleDecision && <div className="mt-4">{decisionBadge(visibleDecision)}</div>}

        <div className="mt-4">
          {extractionFailed && currentStage === "CV_SCREENING" ? (
            <p className="text-sm text-amber-700" role="status">We could not complete your CV extraction. Your application is saved. Please contact the recruitment team with a readable PDF or DOCX; no CV result has been issued.</p>
          ) : processing ? (
            <p className="text-sm text-slate-600" role="status">Your CV is securely queued for scoring. This page updates automatically.</p>
          ) : currentStage === "ONSITE" ? (
            onsiteInvite ? <div className="text-sm text-slate-700">
              <p className="font-semibold text-ink-900">Onsite screening: {onsiteInvite.scheduledAt.toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</p>
              <p className="mt-1">{onsiteInvite.location || "The recruitment team will confirm the location."}</p>
              {onsiteInvite.locationUrl && <a href={onsiteInvite.locationUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-brand-700 hover:underline">Open location details</a>}
              {onsiteInvite.notes && <p className="mt-2 text-slate-600">{onsiteInvite.notes}</p>}
            </div> : <p className="text-sm font-medium text-amber-700">You have been selected for onsite screening. The recruitment team will email the date and location details.</p>
          ) : phaseAvailable && currentStage !== "FINAL" ? (
            <>
              <p className="mb-3 text-sm text-slate-600">This assessment is ready. Your timer starts only when you begin.</p>
              <LinkButton href={`/candidate/test/${app.id}/${currentStage}`} className="btn-primary">
                Start {STAGE_LABEL[currentStage] || currentStage} →
              </LinkButton>
            </>
          ) : scheduled ? (
            <p className="text-sm font-medium text-amber-700">This assessment opens on {opensAt!.toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC. You’ll be notified here automatically when it is available.</p>
          ) : currentDecision === "PENDING" || app.cvResult === "PENDING" ? (
            <p className="text-sm font-medium text-amber-700">Your submission is under review. No action is needed from you.</p>
          ) : app.status === "REJECTED" ? (
            <p className="text-sm font-medium text-rose-700">Your application was not selected. Please see the latest update below.</p>
          ) : app.status === "OFFERED" || app.status === "HIRED" ? (
            <p className="text-sm font-medium text-emerald-700">Congratulations — you have been selected. The recruitment team will contact you with the next details.</p>
          ) : !app.funnelId && currentStage === "CV_SCREENING" ? (
            <p className="text-sm font-medium text-slate-700">Your application review is complete. The recruitment team will contact you if you are selected for an assessment.</p>
          ) : currentStage === "FINAL" ? (
            <p className="text-sm font-medium text-amber-700">Your assessments are complete and your final decision is pending.</p>
          ) : (
            <p className="text-sm font-medium text-amber-700">Waiting for the recruitment team to release your next action. You’ll be notified here automatically.</p>
          )}
        </div>
      </section>

      <SectionTitle>CV screening</SectionTitle>
      <Card className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Screening status</p>
            <div className="mt-1"><span className={processing ? "badge-info" : "badge-muted"}>{extractionFailed ? "Needs attention" : processing ? "Processing" : "Reviewed"}</span></div>
          </div>
          <a href={`/api/cv/${app.id}?token=${cvToken}`} className="btn-outline text-sm">Download your CV</a>
        </div>
      </Card>

      <SectionTitle action={<form action={markNotificationsReadAction}><button className="btn-ghost text-sm">Mark all read</button></form>}>Latest updates</SectionTitle>
      <div className="space-y-2" aria-live="polite">
        {notes.length === 0 ? (
          <Card className="text-sm text-slate-500">No updates yet. This page refreshes automatically.</Card>
        ) : notes.map((note) => (
          <Card key={note.id} className={`text-sm ${note.read ? "text-slate-600" : "border-brand-200 bg-brand-50 text-ink-900"}`}>
            <div className="flex items-start justify-between gap-3">
              <p>{candidateSafeNotification(note.message, app.status === "HOLD")}</p>
              {!note.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
            </div>
            <p className="mt-1 text-xs text-slate-400">{note.createdAt.toLocaleString()}</p>
          </Card>
        ))}
      </div>
      <div className="mt-3"><LinkButton href="/candidate/notifications" className="btn-ghost">View notification history</LinkButton></div>
    </div>
  );
}
