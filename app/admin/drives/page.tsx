import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { SectionTitle, LinkButton, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminDrivesList({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const archived = (await searchParams).archived === "1";
  await requireRole("admin");
  const drives = await prisma.drive.findMany({
    where: { status: archived ? "ARCHIVED" : { not: "ARCHIVED" } },
    include: { _count: { select: { applications: { where: { sourceApplicationId: null } }, funnels: true } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Drives</h1>
        <LinkButton href="/admin/drives/new" className="btn-primary">+ New drive</LinkButton>
      </div>
      <LinkButton href={archived ? "/admin/drives" : "/admin/drives?archived=1"} className="btn-outline mb-4">{archived ? "Current drives" : "Archived drives"}</LinkButton>
      {drives.length === 0 && <Card>No {archived ? "archived" : "current"} drives.</Card>}
      <div className="grid gap-4 md:grid-cols-2">
        {drives.map((d) => (
          <Card key={d.id} hover>
            <Link href={`/admin/drives/${d.id}`}>
              <h3 className="font-bold text-ink-900">{d.name}</h3>
              <span className="badge-muted mt-2">{d.status}</span>
              <p className="text-sm text-slate-500 mt-1">{d.location}</p>
              <div className="flex gap-4 mt-3 text-sm text-slate-500">
                <span>Threshold <b className="text-ink-900">{d.cvPassThreshold}</b></span>
                <span>Applicants <b className="text-ink-900">{d._count.applications}</b></span>
                <span>Funnels <b className="text-ink-900">{d._count.funnels}</b></span>
              </div>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
