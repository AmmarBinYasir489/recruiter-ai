import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, LinkButton } from "@/components/ui";
import { ThresholdEditor } from "@/components/ThresholdEditor";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ThresholdPage({ params: paramsPromise }: { params: Promise<{ driveId: string }> }) {
  const params = await paramsPromise;
  const user = await requireRole("recruiter");
  const drive = await prisma.drive.findUnique({ where: { id: params.driveId } });
  if (!drive || drive.ownerId !== user.id) return <Card>Drive not found.</Card>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-ink-900 mb-1">{drive.name}</h1>
      <p className="text-slate-500 mb-6">CV pass threshold — two-step change</p>
      <ThresholdEditor driveId={drive.id} currentThreshold={drive.cvPassThreshold} />
      <div className="mt-4">
        <LinkButton href={`/recruiter/drives/${drive.id}`} className="btn-ghost">← Back to drive</LinkButton>
      </div>
    </div>
  );
}
