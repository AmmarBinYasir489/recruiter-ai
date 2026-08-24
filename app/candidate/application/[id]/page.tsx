import { prisma, uj } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { signCvToken } from "@/lib/cv/access";
import { CV_RUBRIC } from "@/lib/engine/cv";
import { resultForCurrentStage } from "@/lib/candidateStage";
import { Card, SectionTitle, decisionBadge, statusBadge, LinkButton, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  CV_SCREENING: "CV screening", CCAT: "CCAT / IQ", MTT: "Math thinking", CODING: "Coding",
  ESSAY: "Essay", PROMPT: "Prompt engineering", ENGLISH_SPEAKING: "English speaking", GAMES: "Games", RAT: "Research test",
  MANUAL_REVIEW: "Manual review", ONSITE: "Onsite", FINAL: "Final decision",
};

const COMPONENT_LABEL: Record<string, string> = {
  academics: "Academics", universityDegree: "University & degree", skills: "Skills",
  projects: "Projects", experience: "Experience", other: "Other evidence",
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
  const extracted = uj<any>(app.extractedCv) || {};
  const currentStage = app.currentStage || "CV_SCREENING";
  const currentResult = resultForCurrentStage(app.results, currentStage);
  const cvToken = signCvToken(app.id, user.id);
  const processing = app.cvResult === "PROCESSING";
  const currentScore = currentStage === "CV_SCREENING" ? app.cvScore : currentResult?.normalized;
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
            <p className="text-sm text-slate-600">This application is complete. Please see the latest update below.</p>
          ) : (
            <p className="text-sm font-medium text-amber-700">Waiting for the recruitment team to release your next action. You’ll be notified here automatically.</p>
          )}
        </div>
      </section>

      <SectionTitle>CV score and profile</SectionTitle>
      <Card className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">CV score</p>
            <p className="text-2xl font-black text-ink-900">{processing ? "Processing" : `${app.cvScore ?? "—"}/100`}</p>
          </div>
          <a href={`/api/cv/${app.id}?token=${cvToken}`} className="btn-outline text-sm">Download your CV</a>
        </div>

        {extracted.components && (
          <details className="mt-5 border-t border-slate-100 pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-brand-700">How this score was calculated</summary>
            <p className="mt-2 text-xs text-slate-500">Each component is scored out of 100, multiplied by its rubric weight, then added to produce the final score.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-400"><tr><th className="py-2">Component</th><th>Score</th><th>Weight</th><th>Contribution</th></tr></thead>
                <tbody>
                  {Object.entries(extracted.components).map(([key, value]) => {
                    const weight = CV_RUBRIC[key as keyof typeof CV_RUBRIC] || 0;
                    return (
                      <tr key={key} className="border-t border-slate-100">
                        <td className="py-2 font-medium">{COMPONENT_LABEL[key] || key}</td>
                        <td>{Math.round(Number(value))}</td>
                        <td>{weight}%</td>
                        <td>{(Number(value) * weight / 100).toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {extracted.name && (
          <details className="mt-4 border-t border-slate-100 pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-brand-700">Review extracted CV details</summary>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Name</dt><dd className="font-semibold">{extracted.name || "—"}</dd></div>
              <div><dt className="text-slate-500">University</dt><dd className="font-semibold">{extracted.university || "—"}</dd></div>
              <div><dt className="text-slate-500">Degree</dt><dd className="font-semibold">{extracted.degree || "—"}</dd></div>
              <div><dt className="text-slate-500">CGPA</dt><dd className="font-semibold">{extracted.gpa ?? "—"}{extracted.gpaScale ? ` / ${extracted.gpaScale}` : ""}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-1.5">{(extracted.skills || []).map((skill: string) => <Pill key={skill}>{skill}</Pill>)}</div>
          </details>
        )}
      </Card>

      <SectionTitle>Latest updates</SectionTitle>
      <div className="space-y-2" aria-live="polite">
        {notes.length === 0 ? (
          <Card className="text-sm text-slate-500">No updates yet. This page refreshes automatically.</Card>
        ) : notes.map((note) => (
          <Card key={note.id} className={`text-sm ${note.read ? "text-slate-600" : "border-brand-200 bg-brand-50 text-ink-900"}`}>
            <div className="flex items-start justify-between gap-3">
              <p>{note.message}</p>
              {!note.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
            </div>
            <p className="mt-1 text-xs text-slate-400">{note.createdAt.toLocaleString()}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
