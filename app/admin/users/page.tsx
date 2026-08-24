import { prisma } from "@/lib/db";
import { Card, SectionTitle, LinkButton } from "@/components/ui";
import { createUserAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

const ROLES = ["admin", "recruiter", "reviewer", "candidate"];

export default async function AdminUsers() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900 mb-6">Users</h1>

      <SectionTitle>Add user</SectionTitle>
      <Card className="mb-6">
        <form action={createUserAction} className="grid sm:grid-cols-5 gap-3 items-end">
          <div><label className="label" htmlFor="new-user-name">Name</label><input id="new-user-name" name="name" className="input" autoComplete="name" required /></div>
          <div><label className="label" htmlFor="new-user-email">Email</label><input id="new-user-email" name="email" type="email" className="input" autoComplete="email" required /></div>
          <div>
            <label className="label" htmlFor="new-user-role">Role</label>
            <select id="new-user-role" name="role" className="input">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div><label className="label" htmlFor="new-user-password">Temporary password</label><input id="new-user-password" name="password" type="password" minLength={12} autoComplete="new-password" className="input" required /></div>
          <div><button type="submit" className="btn-primary w-full">Create</button></div>
        </form>
      </Card>

      <SectionTitle>All users</SectionTitle>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500 border-b border-slate-100"><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-50">
                <td className="p-3 font-semibold">{u.name}</td>
                <td className="p-3 text-slate-600">{u.email}</td>
                <td className="p-3"><span className="badge-info">{u.role}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
