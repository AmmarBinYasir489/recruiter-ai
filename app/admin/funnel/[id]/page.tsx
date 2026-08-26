import { prisma, uj } from "@/lib/db";
import { Card, LinkButton, decisionBadge, SectionTitle, EmptyState } from "@/components/ui";
import { PhaseThresholdEditor } from "@/components/PhaseThresholdEditor";
import { CohortView, type CohortRow } from "@/components/CohortView";
import { toggleStageEnabledAction } from "@/app/recruiter/actions";
import type { FunnelStage } from "@/lib/engine/funnel";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PHASE_LABEL: Record<string, string> = {
  CV_SCREENING: "CV Screening", CCAT: "CCAT / IQ", MTT: "Math Thinking", CODING: "Coding", ENGLISH_SPEAKING: "English Speaking",
  ESSAY: "Essay", PROMPT: "Prompt Engineering", GAMES: "Games", MANUAL_REVIEW: "Manual Review",
  ONSITE: "Onsite", FINAL: "Final Decision",
};

export default async function AdminFunnelPage({ params: paramsPromise, searchParams: searchParamsPromise }: { params: Promise<{ id: string }>; searchParams: Promise<{ thresholdApplied?: string; phase?: string; preselect?: string }> }) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  await requireRole("admin");
  const funnel = await prisma.funnel.findUnique({ where: { id: params.id }, include: { drive: true } });
  if (!funnel) return <Card>Funnel not found.</Card>;
  const stages = (uj<FunnelStage[]>(funnel.stages) || []).slice().sort((a, b) => a.order - b.order);

  const apps = await prisma.application.findMany({
    where: { funnelId: funnel.id },
    include: { candidate: true, results: true },
  });

  function cohortFor(type: string): CohortRow[] {
    if (type === "CV_SCREENING") {
      return apps.map((a) => ({ id: a.id, candidateName: a.candidate.name, score: a.cvScore ?? 0, result: a.cvResult || "FAIL" }));
    }
    return apps
      .filter((a) => a.results.some((r) => r.type === type))
      .map((a) => {
        const rs = a.results.filter((r) => r.type === type);
        const r = rs[rs.length - 1];
        return { id: a.id, candidateName: a.candidate.name, score: r?.normalized ?? 0, result: r?.status || "PENDING" };
      });
  }

  const history = await prisma.thresholdChange.findMany({ where: { funnelId: funnel.id }, orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-ink-900">{funnel.name} — {funnel.drive.name}</h1>
        <span className="badge-muted">v{funnel.version} {funnel.published ? "· published" : "· draft"}</span>
      </div>
      <p className="text-slate-500 mb-4">{apps.length} applications on this funnel version. Each phase has its own live, audited threshold.</p>

      {searchParams.thresholdApplied && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50 text-sm">
          Threshold updated to <b>{searchParams.thresholdApplied}</b>. Results re-evaluated; notifications sent only where results changed.
        </Card>
      )}

      <SectionTitle>Phases &amp; thresholds</SectionTitle>
      <div className="space-y-3">
        {stages.map((s, i) => (
          <Card key={s.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="h-7 w-7 grid place-items-center rounded-full bg-brand-100 text-brand-700 text-sm font-bold">{i + 1}</span>
                <div>
                  <div className="font-semibold text-ink-900">{s.name} {s.enabled === false && <span className="badge-muted ml-2">disabled</span>}</div>
                  <div className="text-xs text-slate-500">{s.type}{s.gradingMode ? ` · ${s.gradingMode}` : ""}{s.durationMin ? ` · ${s.durationMin} min` : ""}</div>
                </div>
              </div>
              <form action={toggleStageEnabledAction.bind(null, funnel.id, s.id)}>
                <button className="btn-ghost px-2 py-1 text-xs">{s.enabled === false ? "Enable" : "Disable"}</button>
              </form>
            </div>
            {s.enabled !== false && s.type === "ONSITE" && <p className="mt-3 text-sm text-slate-500">Invitation-only stage. Open a candidate to schedule and email the onsite screening; no threshold or portal test applies.</p>}
            {s.enabled !== false && s.type !== "ONSITE" && (
              <PhaseThresholdEditor
                funnelId={funnel.id}
                phaseType={s.type}
                phaseLabel={PHASE_LABEL[s.type] || s.type}
                currentThreshold={s.passScore ?? 0}
              />
            )}
            {s.enabled !== false && s.type !== "ONSITE" && (
              <CohortView
                funnelId={funnel.id}
                phaseType={s.type}
                phaseLabel={PHASE_LABEL[s.type] || s.type}
                rows={cohortFor(s.type)}
                automaticDecision={["CV_SCREENING", "CCAT", "MTT"].includes(s.type)}
                initialSelected={
                  searchParams.phase === s.type && searchParams.preselect
                    ? searchParams.preselect.split(",").filter(Boolean)
                    : undefined
                }
              />
            )}
          </Card>
        ))}
      </div>

      <SectionTitle>Threshold history</SectionTitle>
      {history.length === 0 ? (
        <EmptyState message="No threshold changes yet." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500 border-b border-slate-100"><th className="p-2">When</th><th className="p-2">Phase</th><th className="p-2">Old</th><th className="p-2">New</th><th className="p-2">P→F</th><th className="p-2">F→P</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-slate-50">
                  <td className="p-2 text-xs text-slate-400">{new Date(h.createdAt).toLocaleString()}</td>
                  <td className="p-2">{h.phaseType}</td>
                  <td className="p-2">{h.oldThreshold}</td>
                  <td className="p-2">{h.newThreshold}</td>
                  <td className="p-2 text-rose-600">{h.passToFail}</td>
                  <td className="p-2 text-emerald-600">{h.failToPass}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="mt-4">
        <LinkButton href={`/admin/drives/${funnel.driveId}`} className="btn-ghost">← Back to drive</LinkButton>
      </div>
    </div>
  );
}
