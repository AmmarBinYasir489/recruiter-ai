import { prisma } from "@/lib/db";
import { Card, LinkButton } from "@/components/ui";
import { FunnelBuilder } from "@/components/FunnelBuilder";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminNewFunnelPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  await requireRole("admin");
  const drive = await prisma.drive.findUnique({ where: { id: params.id } });
  if (!drive) return <Card>Drive not found.</Card>;
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-ink-900 mb-1">Create funnel — {drive.name}</h1>
      <p className="text-slate-500 mb-6">Build an independent selection process. Each phase has its own threshold, duration and routing.</p>
      <FunnelBuilder driveId={drive.id} backHref={`/admin/drives/${drive.id}`} />
      <div className="mt-4">
        <LinkButton href={`/admin/drives/${drive.id}`} className="btn-ghost">← Cancel</LinkButton>
      </div>
    </div>
  );
}
