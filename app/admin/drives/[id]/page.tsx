import Link from "next/link";
import { prisma, uj } from "@/lib/db";
import { Card, SectionTitle, LinkButton, StatCard } from "@/components/ui";
import type { FunnelStage } from "@/lib/engine/funnel";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminDriveDetail({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  await requireRole("admin");
  const drive = await prisma.drive.findUnique({
    where: { id: params.id },
    include: {
      owner: true,
      funnels: true,
      _count: { select: { applications: true } },
      applications: { select: { cvResult: true, funnelId: true } },
    },
  });
  if (!drive) return <Card>Drive not found.</Card>;
  const passed = drive.applications.filter((a) => a.cvResult === "PASS").length;
  const unassigned = drive.applications.filter((a) => !a.funnelId).length;
  return (
    <div>
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{drive.name}</h1>
          <p className="text-slate-500">{drive.location} · Owner {drive.owner.name}</p>
        </div>
        <span className="badge-info">{drive.status}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Applicants" value={drive._count.applications} />
        <StatCard label="CV passed" value={passed} />
        <StatCard label="Awaiting assignment" value={unassigned} />
        <StatCard label="Funnels" value={drive.funnels.length} />
      </div>
      <SectionTitle action={<LinkButton href={`/admin/drives/${drive.id}/new-funnel`} className="btn-primary">+ Create funnel</LinkButton>}>
        Funnels (each independently configured)
      </SectionTitle>
      <div className="grid gap-3 md:grid-cols-2 mb-6">
        {drive.funnels.length === 0 && <Card className="text-sm text-slate-600 md:col-span-2">No funnel has been created. Applicants remain safely on hold in this drive&apos;s applicant pool.</Card>}
        {drive.funnels.map((f) => {
          const stages = (uj<FunnelStage[]>(f.stages) || []).filter((s) => s.enabled !== false).sort((a, b) => a.order - b.order);
          const cv = stages.find((s) => s.type === "CV_SCREENING");
          return (
            <Card key={f.id} hover>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-ink-900">{f.name} v{f.version}</h3>
                <Link href={`/admin/funnel/${f.id}`} className="btn-ghost text-xs">Open →</Link>
              </div>
              <p className="text-xs text-slate-500 mt-1">{stages.length} active phases · CV threshold {cv?.passScore ?? "—"}</p>
              <div className="flex flex-wrap gap-1 mt-2">{stages.map((s) => <span key={s.id} className="badge-muted text-xs">{s.type}</span>)}</div>
            </Card>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        <LinkButton href={`/admin/candidates?driveId=${drive.id}&stage=CV_SCREENING`} className="btn-primary">Open drive applicant pool ({unassigned}) →</LinkButton>
        <LinkButton href={`/admin/drives/${drive.id}/scores`} className="btn-outline">Weighted leaderboard →</LinkButton>
      </div>
      <SectionTitle>Candidates</SectionTitle>
      <Card className="text-sm text-slate-600">{drive._count.applications} applications. Filter the drive pool by CV result or score, select candidates, then assign them to a published funnel. Failed CV applicants remain available for an intentional staff override.</Card>
    </div>
  );
}
