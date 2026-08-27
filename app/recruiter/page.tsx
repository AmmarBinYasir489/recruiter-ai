import Link from "next/link";
import { prisma, uj } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, StatCard, SectionTitle, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RecruiterOverview() {
  const user = await getCurrentUser();
  if (!user) return null;
  const drives = await prisma.drive.findMany({
    where: { ownerId: user.id },
    include: { _count: { select: { applications: { where: { sourceApplicationId: null } } } } },
    orderBy: { createdAt: "desc" },
  });
  const totalApps = drives.reduce((s, d) => s + d._count.applications, 0);
  const reviewerCount = await prisma.user.count({ where: { role: "reviewer" } });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Recruiter overview</h1>
        <LinkButton href="/recruiter/drives/new" className="btn-primary">+ New drive</LinkButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <StatCard label="Drives" value={drives.length} />
        <StatCard label="Applications" value={totalApps} />
        <StatCard label="Reviewers" value={reviewerCount} />
      </div>

      <SectionTitle>Recent drives</SectionTitle>
      <div className="space-y-3">
        {drives.map((d) => (
          <Card key={d.id} hover>
            <Link href={`/recruiter/drives/${d.id}`} className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-ink-900">{d.name}</h3>
                <p className="text-sm text-slate-500">CV threshold {d.cvPassThreshold} · {d._count.applications} applicants</p>
              </div>
              <span className="badge-info">{d.status}</span>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
