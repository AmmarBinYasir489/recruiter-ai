import { prisma } from "@/lib/db";
import { Card, SectionTitle, LinkButton } from "@/components/ui";
import { CreateUserForm } from "@/components/CreateUserForm";

export const dynamic = "force-dynamic";


export default async function AdminUsers() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900 mb-6">Users</h1>

      <SectionTitle>Add staff account</SectionTitle>
      <Card className="mb-6">
        <p className="mb-4 text-sm text-slate-600">Create recruiter or reviewer accounts. Candidates register themselves using a public drive link.</p>
        <CreateUserForm />
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
