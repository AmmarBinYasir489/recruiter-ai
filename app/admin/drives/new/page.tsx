import { Card, LinkButton } from "@/components/ui";
import { createDriveAction } from "@/app/recruiter/actions";
import { requireRole } from "@/lib/auth";

export default async function AdminNewDrivePage() {
  await requireRole("admin");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-ink-900 mb-6">New recruitment drive</h1>
      <Card>
        <form action={createDriveAction} className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input name="name" className="input" required placeholder="AI Engineer — August 2026" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Location</label>
              <input name="location" className="input" placeholder="Islamabad, PK" />
            </div>
            <div>
              <label className="label">Application deadline</label>
              <input name="deadline" type="date" className="input" min={today} required />
            </div>
          </div>
          <div>
            <label className="label">Job description</label>
            <textarea name="jobDescription" className="input" rows={5} required placeholder="Describe the role and required skills (Python, ML, ...)" />
            <p className="text-xs text-slate-400 mt-1">Required skills are detected from this text for CV matching.</p>
          </div>
          <div>
            <label className="label">CV pass threshold (0–100)</label>
            <input name="cvPassThreshold" type="number" min={0} max={100} defaultValue={60} className="input w-32" />
            <p className="text-xs text-slate-400 mt-1">Single threshold: CV score ≥ this → Pass. Configurable later via the 2-step workflow.</p>
          </div>
          <button className="btn-primary w-full">Create drive &amp; default funnel</button>
        </form>
      </Card>
      <div className="mt-4">
        <LinkButton href="/admin/drives" className="btn-ghost">← Back to drives</LinkButton>
      </div>
    </div>
  );
}
