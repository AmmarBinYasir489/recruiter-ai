import { prisma, uj } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAudit() {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { actor: true } });
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900 mb-6">Audit log</h1>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500 border-b border-slate-100"><th className="p-3">When</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Detail</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-slate-50 align-top">
                <td className="p-3 text-xs text-slate-400 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="p-3">{l.actor.name}</td>
                <td className="p-3 font-semibold">{l.action}</td>
                <td className="p-3 text-xs text-slate-500 max-w-md">{JSON.stringify(uj(l.meta))}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-400">No audit events.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
