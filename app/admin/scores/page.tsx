import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, SectionTitle, StatCard } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminScores() {
  await requireRole("admin");
  const drives = await prisma.drive.findMany({
    include: { _count: { select: { applications: { where: { sourceApplicationId: null } } } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900 mb-2">Weighted leaderboards</h1>
      <p className="text-slate-500 mb-6">Per-drive weighted scoring (TCI). Open a drive to see the ranked candidate list.</p>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="Drives" value={drives.length} />
        <StatCard label="Total applications" value={drives.reduce((s, d) => s + d._count.applications, 0)} />
      </div>

      <SectionTitle>Drives</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {drives.map((d) => (
          <Card key={d.id} hover>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-ink-900">{d.name}</h3>
              <Link href={`/admin/drives/${d.id}/scores`} className="btn-ghost text-xs">Leaderboard →</Link>
            </div>
            <p className="text-xs text-slate-500 mt-1">{d._count.applications} applications</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
