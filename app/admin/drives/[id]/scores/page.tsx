import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, SectionTitle, statusBadge, decisionBadge, Pill } from "@/components/ui";
import { buildLeaderboard } from "@/lib/engine/leaderboard";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  CV_SCREENING: "CV", CCAT: "CCAT", MTT: "MTT", CODING: "Coding", ESSAY: "Essay", ENGLISH_SPEAKING: "English Speaking",
  PROMPT: "Prompt", GAMES: "Games", RAT: "RAT", MANUAL_REVIEW: "Review", ONSITE: "Onsite",
};

export default async function AdminDriveScores({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  await requireRole("admin");
  const drive = await prisma.drive.findUnique({
    where: { id: params.id },
    include: { applications: { include: { candidate: true } } },
  });
  if (!drive) return <Card>Drive not found.</Card>;
  const rows = buildLeaderboard(drive, drive.applications);
  const stageCols = rows[0] ? Object.keys(rows[0].scores) : [];
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-ink-900">Weighted leaderboard</h1>
        <Link href={`/admin/drives/${drive.id}`} className="btn-ghost text-sm">← Drive</Link>
      </div>
      <p className="text-slate-500 mb-6">Total = weighted sum of stage scores using this drive's TCI weights (higher is better).</p>
      <SectionTitle>Candidates ({rows.length})</SectionTitle>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Candidate</th>
              <th className="py-2 pr-3">Status</th>
              {stageCols.map((c) => <th key={c} className="py-2 pr-3 text-right">{STAGE_LABEL[c] || c}</th>)}
              <th className="py-2 pr-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.applicationId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="py-2 pr-3 text-slate-400">{i + 1}</td>
                <td className="py-2 pr-3">
                  <Link href={`/admin/candidates`} className="font-medium text-ink-900 hover:underline">{r.candidateName}</Link>
                  <div className="text-xs text-slate-400">{r.candidateEmail}</div>
                </td>
                <td className="py-2 pr-3">{statusBadge(r.status)}</td>
                {stageCols.map((c) => (<td key={c} className="py-2 pr-3 text-right tabular-nums">{r.scores[c] ?? 0}</td>))}
                <td className="py-2 pr-3 text-right"><span className="font-black text-ink-900">{r.hasScores ? r.total : "—"}</span></td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><td colSpan={stageCols.length + 4} className="py-6 text-center text-slate-400">No applications yet.</td></tr>)}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
