import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { markNotificationsReadAction } from "@/app/candidate/actions";
import { candidateSafeNotification } from "@/lib/candidatePrivacy";

export const dynamic = "force-dynamic";

export default async function CandidateNotifications() {
  const user = await getCurrentUser();
  if (!user) return null;
  const notes = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const appIds = [...new Set(notes.flatMap((note) => note.relatedAppId ? [note.relatedAppId] : []))];
  const applications = appIds.length ? await prisma.application.findMany({ where: { id: { in: appIds }, candidateId: user.id }, select: { id: true, cvScore: true } }) : [];
  const cvScores = new Map(applications.map((application) => [application.id, application.cvScore]));

  return (
    <div className="max-w-2xl mx-auto">
      <SectionTitle action={
        <form action={markNotificationsReadAction}>
          <button className="btn-ghost">Mark all read</button>
        </form>
      }>Notifications</SectionTitle>
      {notes.length === 0 ? (
        <Card className="text-slate-400 text-sm">No notifications.</Card>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <Card key={n.id} className={`text-sm flex items-start justify-between gap-3 ${n.read ? "opacity-60" : ""}`}>
              <span>{n.type === "CV_SCORED" || n.type === "CV_THRESHOLD" ? `Your CV screening is complete. Your current score is ${cvScores.get(n.relatedAppId || "") ?? "—"}/100.` : candidateSafeNotification(n.message)}</span>
              <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(n.createdAt).toLocaleDateString()}</span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
