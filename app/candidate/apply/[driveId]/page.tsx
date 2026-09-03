import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, LinkButton } from "@/components/ui";
import { CvApplicationForm } from "@/components/CvApplicationForm";
import { driveApplicationError, formatDriveDeadline } from "@/lib/driveApplications";

export const dynamic = "force-dynamic";

export default async function ApplyPage({ params: paramsPromise }: { params: Promise<{ driveId: string }> }) {
  const { driveId } = await paramsPromise;
  const user = await getCurrentUser();
  if (!user || user.role !== "candidate") return null;
  const [drive, existing] = await Promise.all([
    prisma.drive.findUnique({ where: { id: driveId } }),
    prisma.application.findFirst({ where: { candidateId: user.id, driveId } }),
  ]);
  // Intake closure must never block an existing candidate's dashboard.
  if (existing) redirect("/candidate");
  if (!drive) return <Card>Drive not found.</Card>;
  const closed = driveApplicationError(drive);

  return <div className="mx-auto flex max-w-2xl flex-col gap-4">
    <div>
      <h1 className="text-2xl font-bold text-ink-900">{drive.name}</h1>
      <p className="text-sm text-slate-600">{drive.location} · Apply by {formatDriveDeadline(drive.deadline)}, 23:59 UTC</p>
    </div>
    <Card>
      {closed ? <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink-900">Applications closed</h2>
        <p className="text-sm text-slate-600">{closed}</p>
        <LinkButton href="/candidate" className="btn-outline">Go to dashboard</LinkButton>
        <LinkButton href="/" className="btn-ghost">Browse drives</LinkButton>
      </div> : <CvApplicationForm driveId={drive.id} />}
    </Card>
  </div>;
}
