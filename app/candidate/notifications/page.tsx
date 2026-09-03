import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { markNotificationsReadAction } from "@/app/candidate/actions";
import { candidateSafeNotification } from "@/lib/candidatePrivacy";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CandidateNotifications({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const query = await searchParams;
  const page = Math.max(1, Math.min(10000, Math.floor(Number(query.page) || 1)));
  const [notes, heldApplications] = await Promise.all([
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 21 }),
    prisma.application.findMany({ where: { candidateId: user.id, status: "HOLD" }, select: { id: true } }),
  ]);
  const heldIds = new Set(heldApplications.map((application) => application.id));
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
          {notes.slice(0, 20).map((n) => (
            <Card key={n.id} className={`text-sm flex items-start justify-between gap-3 ${n.read ? "opacity-60" : ""}`}>
              <span>{candidateSafeNotification(n.message, Boolean(n.relatedAppId && heldIds.has(n.relatedAppId)))}</span>
              <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(n.createdAt).toLocaleDateString()}</span>
            </Card>
          ))}
        </div>
      )}
      <nav className="mt-4 flex gap-3" aria-label="Notification pages">
        {page > 1 && <Link className="btn-outline" href={`/candidate/notifications?page=${page - 1}`}>Newer updates</Link>}
        {notes.length > 20 && <Link className="btn-outline" href={`/candidate/notifications?page=${page + 1}`}>Older updates</Link>}
      </nav>
    </div>
  );
}
