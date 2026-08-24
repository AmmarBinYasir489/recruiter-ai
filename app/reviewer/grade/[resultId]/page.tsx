import { prisma, uj } from "@/lib/db";
import { Card, SectionTitle, LinkButton } from "@/components/ui";
import { gradeAssessmentAction } from "@/app/reviewer/actions";
import { requireRole } from "@/lib/auth";
import { reviewerCanGrade } from "@/lib/reviewerAccess";

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
    include: { application: { include: { candidate: true, funnel: true } } },
  });
  if (!result) return <Card>Result not found.</Card>;
  if (!reviewerCanGrade(user, result.type, result.application.funnel)) return <Card>You are not assigned to this assessment.</Card>;
  const answers = uj<{ text?: string; items?: { number: number; prompt?: string; answer?: string; score?: number; feedback?: string }[] }>(result.answers) || {};
  const rubric = RUBRICS[result.type] || [];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-ink-900 mb-1">Grade {result.type}</h1>
      <p className="text-slate-500 mb-6">{result.application.candidate.name}</p>

      <Card className="mb-4">
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
                {item.feedback ? <p className="mt-2 text-xs text-brand-700">AI aid: {item.feedback}</p> : null}
              </section>
            ))}
          </div>
        ) : (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{answers.text || "(no text captured)"}</pre>
        )}
      </Card>

      <Card>
        <form action={gradeAssessmentAction.bind(null, result.id)} className="space-y-3">
          {rubric.map((r) => (
            <div key={r.key} className="flex items-center gap-3">
              <label className="text-sm flex-1">{r.label}</label>
              <input type="number" name={r.key} min={0} max={100} defaultValue={70} className="input w-28" />
            </div>
          ))}
          <div>
            <label className="label">Reviewer notes</label>
            <textarea name="notes" className="input" rows={3} />
          </div>
          <button className="btn-primary w-full">Submit grade &amp; publish</button>
        </form>
      </Card>

      <div className="mt-4">
        <LinkButton href="/reviewer" className="btn-ghost">← Back to submissions</LinkButton>
      </div>
    </div>
  );
}
