import Link from "next/link";
import { isOnsiteTrack } from "@/lib/onsiteTrack";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, StatCard, SectionTitle, statusBadge, LinkButton, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CandidateDashboard() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [apps, unreadCount] = await Promise.all([
    prisma.application.findMany({
      where: { candidateId: user.id, status: { not: "ARCHIVED" } },
      include: { drive: true, funnel: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.notification.count({
      where: { userId: user.id, read: false },
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

      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        <StatCard label="Applications" value={applicationsByDrive.length} />

        <StatCard label="Unread" value={unreadCount} />
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

                </div>

              </div>
              {tracks.map((track) => (
                <Card key={track.id} hover>
                  <Link href={`/candidate/application/${track.id}`} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900">{isOnsiteTrack(track.trackKey) ? "Onsite assessment" : "Application progress"}</p>
                      <p className="text-sm text-slate-500">
                        Current step: <b>{({ CV_SCREENING: "CV screening", CCAT: "CCAT / IQ", MTT: "Math thinking test", ENGLISH_SPEAKING: "English speaking", PROMPT: "Prompt engineering", FINAL: "Final review" } as Record<string, string>)[track.currentStage || ""] || track.currentStage?.toLowerCase().replaceAll("_", " ") || "Application review"}</b>
                      </p>
                      <p className={`mt-1 text-xs font-medium ${track.phaseReleased ? "text-brand-700" : "text-slate-400"}`}>
                        {["OFFERED", "HIRED"].includes(track.status) ? "You have been selected — open for details" : track.status === "REJECTED" ? "Application reviewed — open for details" : track.phaseReleased ? "Open your application to continue" : track.status === "HOLD" ? "Under review — no action needed" : "Waiting for the recruitment team's next update"}
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
