import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, StatCard, SectionTitle, statusBadge, LinkButton, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CandidateDashboard() {
  const user = await getCurrentUser();
  if (!user) return null;
  const apps = await prisma.application.findMany({
    where: { candidateId: user.id },
    include: { drive: true },
    orderBy: { createdAt: "desc" },
  });
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id, read: false },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Welcome, {user.name}</h1>
      <p className="text-slate-500 mb-6">Track your applications and stage progress.</p>

      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <StatCard label="Applications" value={apps.length} />
        <StatCard label="In progress" value={apps.filter((a) => a.status === "IN_PROGRESS").length} />
        <StatCard label="Unread" value={notifications.length} />
      </div>

      <SectionTitle
        action={<LinkButton href="/" className="btn-ghost">Browse drives</LinkButton>}
      >
        My applications
      </SectionTitle>

      {apps.length === 0 ? (
        <EmptyState message="You have not applied to any drive yet." />
      ) : (
        <div className="space-y-3">
          {apps.map((a) => (
            <Card key={a.id} hover>
              <Link href={`/candidate/application/${a.id}`} className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-ink-900">{a.drive.name}</h3>
                  <p className="text-sm text-slate-500">
                    Current stage: <b>{a.currentStage || "—"}</b> · Applied {a.appliedAt ? new Date(a.appliedAt).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(a.status)}
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
