import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, SectionTitle, decisionBadge, LinkButton, EmptyState } from "@/components/ui";
import { computeApplicationTotal } from "@/lib/engine/leaderboard";
import { reviewerCanGrade } from "@/lib/reviewerAccess";

export const dynamic = "force-dynamic";

export default async function ReviewerSubmissions() {
  const user = await getCurrentUser();
  if (!user) return null;

  const pendingResults = await prisma.assessmentResult.findMany({
    where: { status: "MANUAL_REVIEW" },
    include: { application: { include: { candidate: true, drive: true, funnel: true } } },
    orderBy: { createdAt: "desc" },
  });
  const results = pendingResults.filter((result) => reviewerCanGrade(user, result.type, result.application.funnel));

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900 mb-2">Assigned submissions</h1>
      <p className="text-slate-500 mb-6">Manual grading for your assigned drives only.</p>

      {results.length === 0 ? (
        <EmptyState message="No submissions awaiting your review." />
      ) : (
        <div className="space-y-3">
          {results.map((r) => (
            <Card key={r.id} hover>
              <Link href={`/reviewer/grade/${r.id}`} className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-ink-900">{r.application.candidate.name}</h3>
                  <p className="text-sm text-slate-500">{r.type} · {r.application.drive.name}</p>
                  <p className="mt-1 text-xs font-semibold text-brand-700">Overall: {computeApplicationTotal(r.application.scores, r.application.drive.tciWeights).total}/100</p>
                </div>
                {decisionBadge(r.status)}
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
