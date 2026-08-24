import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, LinkButton, StatCard, decisionBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  const drives = await prisma.drive.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { applications: true, funnels: true } } },
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 grid place-items-center rounded-xl bg-brand-600 text-white font-black">R</div>
            <span className="font-bold text-ink-900">Recruitment Portal</span>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <LinkButton href={`/${user.role}`} className="btn-primary">Go to {user.role} dashboard</LinkButton>
            ) : (
              <LinkButton href="/login" className="btn-primary">Sign in</LinkButton>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-ink-900">Open recruitment drives</h1>
          <p className="text-slate-500 mt-1">Browse active drives and apply with your CV.</p>
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
                <span>Deadline: <b className="text-ink-900">{new Date(d.deadline).toLocaleDateString()}</b></span>
              </div>
                <div className="mt-auto flex gap-2">
                  {user?.role === "candidate" ? (
                    <LinkButton href={`/candidate/apply/${d.id}`} className="btn-primary">Apply</LinkButton>
                  ) : (
                    <LinkButton href="/login" className="btn-ghost">Sign in to apply</LinkButton>
                  )}
                </div>
              </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
