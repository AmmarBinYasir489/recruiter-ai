import Link from "next/link";
import { prisma, uj } from "@/lib/db";
import { Card, SectionTitle, statusBadge } from "@/components/ui";
import { buildLeaderboard } from "@/lib/engine/leaderboard";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  CV_SCREENING: "CV", CCAT: "CCAT", MTT: "MTT", CODING: "Coding", ESSAY: "Essay", ENGLISH_SPEAKING: "English Speaking",
  PROMPT: "Prompt", GAMES: "Games", RAT: "RAT", MANUAL_REVIEW: "Review", ONSITE: "Onsite",
};

type SP = { funnelId?: string | string[]; mode?: string };

export default async function DriveScores({ params: paramsPromise, searchParams: searchParamsPromise }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const user = await requireRole("recruiter", "admin");
  const drive = await prisma.drive.findUnique({
    where: { id: params.id },
    include: {
      funnels: { orderBy: { createdAt: "desc" } },
      applications: { include: { candidate: true, results: true } },
    },
  });
  if (!drive || (user.role === "recruiter" && drive.ownerId !== user.id)) return <Card>Drive not found.</Card>;

  const requestedFunnelId = Array.isArray(searchParams.funnelId) ? searchParams.funnelId[0] : searchParams.funnelId;
  const selectedFunnel = drive.funnels.find((funnel) => funnel.id === requestedFunnelId)
    || drive.funnels.find((funnel) => funnel.id === drive.defaultFunnelId)
    || drive.funnels[0]
    || null;
  const mode = searchParams.mode === "ONSITE" ? "ONSITE" : "ONLINE";
  const selectedApplications = drive.applications.filter((application) =>
    application.status !== "ARCHIVED" && (application.trackKey.startsWith("ONSITE:") ? "ONSITE" : "ONLINE") === mode && (selectedFunnel ? application.funnelId === selectedFunnel.id : application.funnelId === null),
  );
  const rows = buildLeaderboard(drive, selectedApplications, selectedFunnel ? (uj<any[]>(selectedFunnel.stages) || []).filter((stage) => stage.enabled !== false).map((stage) => stage.type) : ["CV_SCREENING"]);
  const stageCols = rows[0] ? Object.keys(rows[0].scores) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-ink-900">Weighted leaderboard</h1>
        <Link href={`/recruiter/drives/${drive.id}`} className="btn-ghost text-sm">← Drive</Link>
      </div>
      <p className="text-slate-500 mb-4">Candidates are ranked inside one funnel at a time so separate assessment tracks are never counted as duplicate people.</p>
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="min-w-64">
          <label htmlFor="leaderboard-funnel" className="label">Assessment funnel</label>
          <select id="leaderboard-funnel" name="funnelId" className="input" defaultValue={selectedFunnel?.id || ""} aria-describedby="leaderboard-funnel-help">
            {drive.funnels.map((funnel) => <option key={funnel.id} value={funnel.id}>{funnel.name}</option>)}
            {drive.funnels.length === 0 && <option value="">Applicant pool</option>}
          </select>
        </div>
        <div><label htmlFor="leaderboard-mode" className="label">Delivery mode</label><select id="leaderboard-mode" name="mode" className="input" defaultValue={mode}><option value="ONLINE">Online</option><option value="ONSITE">Onsite</option></select></div>
        <button className="btn-primary">View leaderboard</button>
        <p id="leaderboard-funnel-help" className="text-xs text-slate-500">Scores and totals shown below belong only to <strong>{selectedFunnel?.name || "the applicant pool"}</strong>.</p>
      </form>

      <SectionTitle>Candidates ({rows.length})</SectionTitle>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Candidate</th>
              <th className="py-2 pr-3">Status / current phase</th>
              {stageCols.map((c) => <th key={c} className="py-2 pr-3 text-right">{STAGE_LABEL[c] || c}</th>)}
              <th className="py-2 pr-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.applicationId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="py-2 pr-3 text-slate-400">{i + 1}</td>
                <td className="py-2 pr-3">
                  <Link href={`/recruiter/candidates/${r.applicationId}`} className="font-medium text-ink-900 hover:underline">{r.candidateName}</Link>
                  <div className="text-xs text-slate-400">{r.candidateEmail}</div>
                  <div className="text-xs font-medium text-brand-700">{selectedFunnel?.name || "Applicant pool"} · {r.applicationId.slice(0, 8).toUpperCase()}</div>
                </td>
                <td className="py-2 pr-3">{statusBadge(r.status)}<p className="mt-1 text-xs">{STAGE_LABEL[r.currentStage || ""] || r.currentStage}</p></td>
                {stageCols.map((c) => (
                  <td key={c} className="py-2 pr-3 text-right tabular-nums">{r.scores[c] ?? 0}</td>
                ))}
                <td className="py-2 pr-3 text-right">
                  <span className="font-black text-ink-900">{r.total}/100</span><p className="text-xs text-slate-500">{r.gradedCount}/{r.assessmentCount} graded{!r.complete ? " · provisional" : ""}</p>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={stageCols.length + 4} className="py-6 text-center text-slate-400">No applications yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
