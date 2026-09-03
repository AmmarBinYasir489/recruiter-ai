import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, LinkButton, StatCard, decisionBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { driveApplicationError, formatDriveDeadline } from "@/lib/driveApplications";
import { publicApplyPath } from "@/lib/publicApplications";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  const drives = await prisma.drive.findMany({
    where: user?.role === "candidate"
      ? { OR: [{ status: "OPEN" }, { applications: { some: { candidateId: user.id } } }] }
      : { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { applications: { where: { sourceApplicationId: null } }, funnels: true } } },
  });
  const existingApplications = user?.role === "candidate"
    ? await prisma.application.findMany({ where: { candidateId: user.id }, select: { driveId: true } })
    : [];
  const appliedDriveIds = new Set(existingApplications.map((app) => app.driveId));

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-wrap gap-3 items-center justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 grid place-items-center rounded-xl bg-brand-600 text-white font-black">R</div>
            <span className="font-bold text-ink-900">Recruitment Portal</span>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <LinkButton href={`/${user.role}`} className="btn-primary">Go to {user.role} dashboard</LinkButton>
            ) : (
              <><LinkButton href="/login" className="btn-outline">Sign in</LinkButton><LinkButton href="/signup" className="btn-primary">Create account</LinkButton></>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-ink-900">Recruitment drives</h1>
          <p className="text-slate-500 mt-1">Apply to open drives with your CV, or continue an existing application.</p>
        </div>

        {drives.length === 0 && <Card className="text-center text-slate-400 py-10">No open drives right now.</Card>}

        <div className="grid gap-5 md:grid-cols-2">
          {drives.map((d) => (
            <Card key={d.id} hover className="flex flex-col gap-3">
              <div>
                <h3 className="text-lg font-bold text-ink-900">{d.name}</h3>
                <p className="text-sm text-slate-500">{d.location}</p>
              </div>
              <p className="text-sm text-slate-600 line-clamp-3">{d.jobDescription}</p>
              <div className="flex gap-6 text-sm text-slate-500">
                <span>Deadline: <b className="text-ink-900">{formatDriveDeadline(d.deadline)}, 23:59 UTC</b></span>
              </div>
                <div className="mt-auto flex gap-2">
                  {appliedDriveIds.has(d.id) ? (
                    <LinkButton href="/candidate" className="btn-primary">Continue to dashboard</LinkButton>
                  ) : driveApplicationError(d) ? (
                    <span className="badge-muted">Applications closed</span>
                  ) : user?.role === "candidate" ? (
                    <LinkButton href={`/candidate/apply/${d.id}`} className="btn-primary">Apply</LinkButton>
                  ) : (
                    <LinkButton href={publicApplyPath(d.id)} className="btn-primary">View & apply</LinkButton>
                  )}
                </div>
              </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
