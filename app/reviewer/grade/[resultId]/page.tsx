import { prisma, uj } from "@/lib/db";
import { Card, SectionTitle, LinkButton } from "@/components/ui";
import { gradeAssessmentAction } from "@/app/reviewer/actions";
import { requireRole } from "@/lib/auth";
import { reviewerCanGrade } from "@/lib/reviewerAccess";
import { computeApplicationTotal } from "@/lib/engine/leaderboard";

export const dynamic = "force-dynamic";

const RUBRICS: Record<string, { key: string; label: string }[]> = {
  CODING: [
    { key: "correctness", label: "Correctness" },
    { key: "codeQuality", label: "Code quality" },
    { key: "logic", label: "Logic" },
    { key: "efficiency", label: "Efficiency" },
    { key: "bestPractices", label: "Best practices" },
  ],
  ESSAY: [
    { key: "understanding", label: "Understanding" },
    { key: "communication", label: "Communication" },
    { key: "criticalThinking", label: "Critical thinking" },
    { key: "problemSolving", label: "Problem solving" },
    { key: "domainKnowledge", label: "Domain knowledge" },
  ],
  PROMPT: [
    { key: "promptDesign", label: "Prompt design" },
    { key: "clarity", label: "Clarity" },
    { key: "structure", label: "Structure" },
    { key: "reasoning", label: "Reasoning" },
    { key: "outcome", label: "Outcome" },
  ],
};

export default async function GradePage({ params: paramsPromise }: { params: Promise<{ resultId: string }> }) {
  const params = await paramsPromise;
  const user = await requireRole("reviewer", "admin");
  const result = await prisma.assessmentResult.findUnique({
    where: { id: params.resultId },
    include: { application: { include: { candidate: true, funnel: true, drive: true } } },
  });
  if (!result) return <Card>Result not found.</Card>;
  if (!reviewerCanGrade(user, result.type, result.application.funnel)) return <Card>You are not assigned to this assessment.</Card>;
  const answers = uj<{ text?: string; items?: { number: number; prompt?: string; answer?: string; score?: number; maxScore?: number; feedback?: string }[] }>(result.answers) || {};
  const rubric = RUBRICS[result.type] || [];
  const overall = computeApplicationTotal(result.application.scores, result.application.drive.tciWeights);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-ink-900 mb-1">Grade {result.type}</h1>
      <p className="text-slate-500 mb-2">{result.application.candidate.name}</p>
      <p className="mb-6 text-sm font-semibold text-brand-700">Overall candidate score: {overall.total}/100{overall.complete ? "" : " (provisional)"}</p>

      <form action={gradeAssessmentAction.bind(null, result.id)} className="space-y-4">
      <Card>
        <SectionTitle>Submission</SectionTitle>
        {result.type === "ENGLISH_SPEAKING" ? (
          <div>
            <audio className="w-full" controls preload="metadata" src={`/api/assessment-audio/${result.id}`}>
              Your browser does not support audio playback.
            </audio>
            <p className="mt-2 text-xs text-slate-500">Private recording link expires shortly and requires reviewer access.</p>
          </div>
        ) : answers.items?.length ? (
          <div className="max-h-[32rem] space-y-4 overflow-auto">
            {answers.items.map((item) => (
              <section key={item.number} className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-500">Question {item.number}</p>
                {item.prompt ? <p className="mt-1 text-sm font-medium text-ink-900">{item.prompt}</p> : null}
                <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.answer || "(no answer)"}</pre>
                {item.feedback ? <p className="mt-2 text-xs text-brand-700">AI first-pass: {item.feedback}</p> : null}
                <div className="mt-3 flex items-center gap-3 border-t border-slate-200 pt-3">
                  <label htmlFor={`questionScore_${item.number}`} className="text-sm font-semibold text-ink-900">Approved score</label>
                  <input
                    id={`questionScore_${item.number}`}
                    type="number"
                    name={`questionScore_${item.number}`}
                    min={0}
                    max={item.maxScore || 10}
                    step="1"
                    required
                    defaultValue={item.score ?? 0}
                    className="input w-24"
                  />
                  <span className="text-sm text-slate-500">/ {item.maxScore || 10}</span>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{answers.text || "(no text captured)"}</pre>
        )}
      </Card>

      <Card>
        <div className="space-y-3">
          {!answers.items?.length && rubric.map((r) => (
            <div key={r.key} className="flex items-center gap-3">
              <label className="text-sm flex-1">{r.label}</label>
              <input type="number" name={r.key} min={0} max={100} defaultValue={70} className="input w-28" />
            </div>
          ))}
          {!answers.items?.length && rubric.length === 0 ? (
            <div className="flex items-center gap-3">
              <label htmlFor="manualScore" className="text-sm flex-1">Score out of 100</label>
              <input id="manualScore" type="number" name="score" min={0} max={100} step="1" required defaultValue={result.normalized || 0} className="input w-28" />
            </div>
          ) : null}
          <div>
            <label className="label">Reviewer notes</label>
            <textarea name="notes" className="input" rows={3} />
          </div>
          {answers.items?.length ? <p className="text-xs text-slate-500">AI scores are prefilled. Review every answer, adjust if needed, then approve. Approval does not release the next phase.</p> : null}
          <button className="btn-primary w-full">Approve grade</button>
        </div>
      </Card>
      </form>

      <div className="mt-4">
        <LinkButton href="/reviewer" className="btn-ghost">← Back to submissions</LinkButton>
      </div>
    </div>
  );
}
