import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, LinkButton } from "@/components/ui";
import { driveApplicationError, formatDriveDeadline } from "@/lib/driveApplications";
import { publicApplyPath } from "@/lib/publicApplications";

export const dynamic = "force-dynamic";

export default async function PublicApplyPage({ params }: { params: Promise<{ driveId: string }> }) {
  const { driveId } = await params;
  let drive = await prisma.drive.findUnique({ where: { id: driveId } });
  if (!drive) {
    // Honor old links only if unambiguous. Never choose between same-name drives.
    const legacy = await prisma.drive.findMany({ where: { publicLink: `/apply/${driveId}` }, take: 2 });
    if (legacy.length !== 1) notFound();
    drive = legacy[0];
  }
  const user = await getCurrentUser();
  const closed = driveApplicationError(drive);
  if (user?.role === "candidate") {
    const existing = await prisma.application.findFirst({ where: { driveId: drive.id, candidateId: user.id }, select: { id: true } });
    if (existing) redirect("/candidate");
    if (!closed) redirect(`/candidate/apply/${drive.id}`);
  }
  const returnTo = encodeURIComponent(publicApplyPath(drive.id));
  return <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6 sm:py-12">
    <LinkButton href="/" className="btn-ghost self-start">All drives</LinkButton>
    <header>
      <h1 className="break-words text-2xl font-bold text-ink-900 sm:text-3xl">{drive.name}</h1>
      <p className="mt-2 text-sm text-slate-600">{drive.location}</p>
      <p className="mt-1 text-sm text-slate-600">Apply by {formatDriveDeadline(drive.deadline)}, 23:59 UTC</p>
    </header>
    <Card><h2 className="mb-3 text-lg font-semibold">About this opportunity</h2><p className="whitespace-pre-wrap break-words text-slate-700">{drive.jobDescription || "Apply with your CV to be considered by the recruitment team."}</p></Card>
    <Card>
      {closed ? <div className="space-y-3">
        <h2 className="text-lg font-semibold">Applications closed</h2>
        <p className="text-sm text-slate-600">New applications are no longer accepted. If you already applied, sign in to continue your assessments.</p>
        <LinkButton href={user ? `/${user.role}` : `/login?returnTo=${returnTo}`} className="btn-outline">{user ? "Go to dashboard" : "Sign in to continue"}</LinkButton>
      </div> : user ? <div className="space-y-3">
        <p className="text-sm text-slate-600">You are signed in to a staff account. Share this link with candidates; they can create their own account and apply.</p>
        <LinkButton href={`/${user.role}`} className="btn-outline">Go to dashboard</LinkButton>
      </div> : <div className="space-y-4">
        <h2 className="text-lg font-semibold">Apply with your CV</h2>
        <p className="text-sm text-slate-600">Create an account or sign in, then upload your CV. The recruitment team will review your application and notify you of your next step.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <LinkButton href={`/signup?returnTo=${returnTo}`} className="btn-primary min-h-11">Create account & apply</LinkButton>
          <LinkButton href={`/login?returnTo=${returnTo}`} className="btn-outline min-h-11">Already registered? Sign in</LinkButton>
        </div>
      </div>}
    </Card>
  </main>;
}
