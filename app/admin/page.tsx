import { prisma } from "@/lib/db";
import { Card, StatCard, SectionTitle, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const [users, drives, apps, audit] = await Promise.all([
    prisma.user.count(),
    prisma.drive.count(),
    prisma.application.count(),
    prisma.auditLog.count(),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900 mb-6">Admin overview</h1>
      <div className="grid gap-4 sm:grid-cols-4 mb-8">
        <StatCard label="Users" value={users} />
        <StatCard label="Drives" value={drives} />
        <StatCard label="Applications" value={apps} />
        <StatCard label="Audit events" value={audit} />
      </div>
      <SectionTitle>Quick links</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-3">
        <LinkButton href="/admin/users" className="btn-ghost">Manage users</LinkButton>
        <LinkButton href="/admin/tiers" className="btn-ghost">University tiers</LinkButton>
        <LinkButton href="/admin/ai" className="btn-ghost">AI model settings</LinkButton>
        <LinkButton href="/admin/audit" className="btn-ghost">Audit log</LinkButton>
      </div>
    </div>
  );
}
