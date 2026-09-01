import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, StatCard, SectionTitle, statusBadge, LinkButton, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CandidateDashboard() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [apps, notifications] = await Promise.all([
    prisma.application.findMany({
      where: { candidateId: user.id, status: { not: "ARCHIVED" } },
      include: { drive: true, funnel: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.notification.findMany({
      where: { userId: user.id, read: false },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const applicationsByDrive = Array.from(apps.reduce((groups, app) => {
    const current = groups.get(app.driveId) || [];
    current.push(app);
    groups.set(app.driveId, current);
    return groups;
  }, new Map<string, typeof apps>()));
  const activeTracks = apps.filter((app) => ["IN_PROGRESS", "HOLD", "SUBMITTED"].includes(app.status)).length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Welcome, {user.name}</h1>
      <p className="text-slate-500 mb-6">Track your applications and stage progress.</p>

      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <StatCard label="Applications" value={applicationsByDrive.length} />
        <StatCard label="Active funnel tracks" value={activeTracks} />
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
        <div className="flex flex-col gap-5">
          {applicationsByDrive.map(([driveId, tracks]) => (
            <section key={driveId} aria-labelledby={`drive-${driveId}`} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 id={`drive-${driveId}`} className="font-bold text-ink-900">{tracks[0].drive.name}</h3>
                  <p className="text-sm text-slate-500">
                    {tracks.length === 1
                      ? "1 recruitment-assigned assessment track"
                      : `${tracks.length} recruitment-assigned tracks · complete each active track separately`}
                  </p>
                </div>
                {tracks.length > 1 && <span className="badge-info">{tracks.length} funnels</span>}
              </div>
              {tracks.map((track) => (
                <Card key={track.id} hover>
                  <Link href={`/candidate/application/${track.id}`} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900">{track.funnel?.name || "Drive application"}</p>
                      <p className="text-sm text-slate-500">
                        Current step: <b>{track.currentStage || "—"}</b> · Reference {track.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className={`mt-1 text-xs font-medium ${track.phaseReleased ? "text-brand-700" : "text-slate-400"}`}>
                        {track.phaseReleased ? "Action available — open this track to continue" : "Waiting for the recruitment team to release the next action"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">{statusBadge(track.status)}</div>
                  </Link>
                </Card>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
