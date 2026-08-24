import Link from "next/link";
import { prisma, uj } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, SectionTitle, decisionBadge, LinkButton, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReviewerSubmissions() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Drives where this reviewer is assigned in the funnel.
  const drives = await prisma.drive.findMany({ include: { funnels: true } });
  const assignedDriveIds = drives
    .filter((d) => (d.funnels[0] ? uj<any[]>(d.funnels[0].stages) : []).some((s) => (s.assignedReviewers || []).includes(user.id)))
    .map((d) => d.id);

  const results = await prisma.assessmentResult.findMany({
    where: { status: "MANUAL_REVIEW", application: { driveId: { in: assignedDriveIds } } },
    include: { application: { include: { candidate: true, drive: true } } },
    orderBy: { createdAt: "desc" },
  });

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
