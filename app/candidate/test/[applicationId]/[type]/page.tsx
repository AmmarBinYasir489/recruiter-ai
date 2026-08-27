import { prisma, uj, getFunnel } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, LinkButton } from "@/components/ui";
import {
  submitAutoTestAction,
  submitSubjectiveAction,
  submitGameAction,
  getAssessmentAttemptAction,
} from "@/app/candidate/actions";
import { StartAssessmentButton } from "@/components/StartAssessmentButton";
import { Countdown } from "@/components/Countdown";
import { ProctorMonitor } from "@/components/ProctorMonitor";
import { WordCountTextarea } from "@/components/WordCountTextarea";
import { GamesAssessment } from "@/components/games/GamesAssessment";
import { EnglishSpeakingAssessment } from "@/components/EnglishSpeakingAssessment";
import { ENGLISH_SPEAKING_MAX_SECONDS, ENGLISH_SPEAKING_MIN_SECONDS, ENGLISH_SPEAKING_QUESTIONS } from "@/lib/englishSpeaking";
import { selectAttemptQuestions } from "@/lib/assessmentQuestions";
import { CcatAssessment } from "@/components/assessment/CcatAssessment";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  CCAT: "CCAT / IQ", MTT: "Math Thinking Test", ESSAY: "Essay",
  CODING: "Coding", PROMPT: "Prompt Engineering", GAMES: "Games",
  ENGLISH_SPEAKING: "English Speaking",
};

async function getBank(bank: string, attemptId: string) {
  const qs = await prisma.question.findMany({ where: { bank }, orderBy: { number: "asc" } });
  return selectAttemptQuestions(qs, attemptId, bank).map((q) => ({ number: q.number, ...uj<any>(q.content) }));
}

export default async function TestPage({ params: paramsPromise }: { params: Promise<{ applicationId: string; type: string }> }) {
  const params = await paramsPromise;
  const user = await getCurrentUser();
  if (!user) return null;
  const { applicationId, type } = params;
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app || app.candidateId !== user.id) return <Card>Not found.</Card>;
  if (!STAGE_LABEL[type]) return <Card>Unknown stage.</Card>;
  const funnel = app.funnelId ? await getFunnel(app.funnelId) : null;
  const stage = funnel?.stages.find((item) => item.type === type);
  const opensAt = stage?.opensAt ? new Date(stage.opensAt) : null;
  const phaseAvailable = app.phaseReleased || Boolean(opensAt && Number.isFinite(opensAt.getTime()) && opensAt.getTime() <= Date.now());

  // Gating: the candidate may only open the test when the recruiter has
  // released this specific stage for this application.
  if (app.currentStage !== type || !phaseAvailable) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card>
          <h1 className="text-xl font-bold text-ink-900">{STAGE_LABEL[type]}</h1>
          <p className="text-sm text-amber-600 mt-2">
            {opensAt && opensAt.getTime() > Date.now()
              ? `This assessment opens on ${opensAt.toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC.`
              : "This stage is not available yet. The recruitment team will notify you when it opens."}
          </p>
          <p className="text-xs text-slate-400 mt-2">Your current stage: <b>{app.currentStage ? STAGE_LABEL[app.currentStage] : "—"}</b></p>
          <div className="mt-4 flex flex-wrap gap-2">
            {app.phaseReleased && app.currentStage && STAGE_LABEL[app.currentStage] && (
              <LinkButton href={`/candidate/test/${applicationId}/${app.currentStage}`} className="btn-primary">
                Open {STAGE_LABEL[app.currentStage]}
              </LinkButton>
            )}
            <LinkButton href={`/candidate/application/${applicationId}`} className="btn-outline">
              Back to application
            </LinkButton>
          </div>
        </Card>
      </div>
    );
  }

  // If a retest (or first attempt) is active, show the form regardless of any
  // prior result. Only when there is no active attempt AND a result already
  // exists do we treat it as final.
  const attempt = await getAssessmentAttemptAction(applicationId, type);
  if (!attempt) {
    const readyRetest = await prisma.assessmentAttempt.findFirst({
      where: { applicationId, type, status: "READY" },
      select: { id: true },
    });
    const existing = await prisma.assessmentResult.findFirst({ where: { applicationId, type } });
    if (existing && !readyRetest) {
      return (
        <div className="max-w-3xl mx-auto">
          <Card>
            <h1 className="text-xl font-bold text-ink-900">{STAGE_LABEL[type]}</h1>
            <p className="text-sm text-slate-600 mt-2">You have already submitted this assessment. Results are final.</p>
            <a href={`/candidate/application/${applicationId}`} className="btn-outline text-sm mt-3 inline-block">Back to application</a>
          </Card>
        </div>
      );
    }
  }

  const durationMin = stage?.durationMin && stage.durationMin > 0 ? stage.durationMin : null;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-ink-900">{STAGE_LABEL[type]}</h1>
      <p className="text-slate-500 mb-4">Complete this stage for your application.</p>

      {!attempt ? (
        <Card className="space-y-3">
          <p className="text-sm text-slate-600">Start the assessment to begin. The timer is server-enforced; refreshing recovers your in-progress attempt.</p>
          <StartAssessmentButton applicationId={applicationId} type={type} durationMin={durationMin} />
        </Card>
      ) : (
        <>
          <Countdown deadlineAt={attempt.deadlineAt ? new Date(attempt.deadlineAt).toISOString() : null} applicationId={applicationId} />
          {type === "CCAT" && <CcatAssessment applicationId={applicationId} attemptId={attempt.id} questions={(await getBank("CCAT", attempt.id)).map((q) => ({ number: q.number, text: q.text, options: q.options, imageUrl: q.imageUrl, localImagePath: q.localImagePath }))} />}
          {type === "MTT" && <CcatAssessment type="MTT" applicationId={applicationId} attemptId={attempt.id} questions={(await getBank("MTT", attempt.id)).map((q) => ({ number: q.number, text: q.text, options: q.options, optionImages: q.optionImages, imageUrl: q.imageUrl }))} />}
          {(type === "ESSAY" || type === "CODING" || type === "PROMPT") && (
            <SubjectiveForm applicationId={applicationId} attemptId={attempt.id} type={type} questions={await getBank(type, attempt.id)} />
          )}
          {type === "GAMES" && <GameForm applicationId={applicationId} attemptId={attempt.id} />}
          {type === "ENGLISH_SPEAKING" && (
            <EnglishSpeakingAssessment
              applicationId={applicationId}
              attemptId={attempt.id}
              questions={ENGLISH_SPEAKING_QUESTIONS}
              minSeconds={ENGLISH_SPEAKING_MIN_SECONDS}
              maxSeconds={ENGLISH_SPEAKING_MAX_SECONDS}
            />
          )}
        </>
      )}
    </div>
  );
}

function SubjectiveForm({ applicationId, attemptId, type, questions }: { applicationId: string; attemptId: string; type: string; questions: any[] }) {
  const labels: Record<string, string> = {
    ESSAY: "Essay",
    CODING: "Coding",
    PROMPT: "Prompt Engineering",
  };
  const questionText = (q: any) => q?.prompt ?? q?.text ?? q?.question ?? q?.title ?? "";
  return (
    <form action={submitSubjectiveAction.bind(null, applicationId, type)} className="select-none">
      <ProctorMonitor stage={type} applicationId={applicationId} attemptId={attemptId} />
      <Card className="space-y-4">
        <p className="text-sm text-slate-600">Answer every question below, then submit for review.</p>
        {questions.length === 0 ? (
          <WordCountTextarea name="answer" rows={10} minWords={type === "ESSAY" ? 200 : 0} placeholder={`Write your ${labels[type] ?? "response"} here…`} />
        ) : (
          questions.map((q, i) => (
            <div key={q.number} className="rounded-xl border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-ink-900">{i + 1}. {questionText(q)}</p>
                {q.minWords ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">~{q.minWords} words</span> : null}
              </div>
              {q.example ? <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-600">{q.example}</pre> : null}
              <WordCountTextarea
                name={`answer_${q.number}`}
                rows={q.minWords && q.minWords >= 200 ? 10 : 5}
                minWords={Number(q.minWords || 0)}
                placeholder="Write your response…"
              />
            </div>
          ))
        )}
        <button className="btn-primary">Submit for review</button>
      </Card>
    </form>
  );
}

function GameForm({ applicationId, attemptId }: { applicationId: string; attemptId: string }) {
  return (
    <form action={submitGameAction.bind(null, applicationId)} className="select-none">
      <ProctorMonitor stage="GAMES" applicationId={applicationId} attemptId={attemptId} />
      <Card className="space-y-3">
        <p className="text-sm text-slate-600">Complete all three Neodým cognitive games. Accuracy and completion time are scored securely.</p>
        <GamesAssessment />
        <button className="btn-primary">Submit game</button>
      </Card>
    </form>
  );
}
