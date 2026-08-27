import Link from "next/link";
import { prisma } from "@/lib/db";
import { SectionTitle, LinkButton, Card } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DrivesList() {
  const user = await requireRole("recruiter");
  const drives = await prisma.drive.findMany({
    where: { ownerId: user.id },
    include: { _count: { select: { applications: { where: { sourceApplicationId: null } }, funnels: true } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Drives</h1>
        <LinkButton href="/recruiter/drives/new" className="btn-primary">+ New drive</LinkButton>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {drives.map((d) => (
          <Card key={d.id} hover>
            <Link href={`/recruiter/drives/${d.id}`}>
              <h3 className="font-bold text-ink-900">{d.name}</h3>
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
