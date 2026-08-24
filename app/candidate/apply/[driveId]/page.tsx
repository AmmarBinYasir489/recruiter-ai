import { prisma, uj } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, LinkButton } from "@/components/ui";
import { applyAction } from "@/app/candidate/actions";

export const dynamic = "force-dynamic";

export default async function ApplyPage({ params: paramsPromise }: { params: Promise<{ driveId: string }> }) {
  const params = await paramsPromise;
  const user = await getCurrentUser();
  if (!user || user.role !== "candidate") return null;
  const drive = await prisma.drive.findUnique({ where: { id: params.driveId }, include: { funnels: true } });
  if (!drive) return <Card>Drive not found.</Card>;

  const existing = await prisma.application.findFirst({ where: { candidateId: user.id, driveId: drive.id } });
  if (existing) {
    return (
      <Card>
        <p>You have already applied to <b>{drive.name}</b>.</p>
        <LinkButton href={`/candidate/application/${existing.id}`} className="btn-primary mt-3">View application</LinkButton>
      </Card>
    );
  }

  const funnels = drive.funnels.filter((f) => f.published);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-ink-900">{drive.name}</h1>
      <p className="text-slate-500 mb-1">{drive.location} · Deadline {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(drive.deadline)}</p>

      <Card>
        <form action={applyAction.bind(null, drive.id)} className="space-y-4">
          {funnels.length > 0 && (
            <div>
              <label className="label">Choose application path</label>
              <div className="space-y-2 mt-1">
                {funnels.map((f, i) => (
                  <label key={f.id} className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer">
                    <input type="radio" name="funnelId" value={f.id} defaultChecked={i === 0} required />
                    <span className="font-semibold text-ink-900">Funnel v{f.version}</span>
                    <span className="text-xs text-slate-400">{(uj<any[]>(f.stages) || []).filter((stage) => stage.enabled !== false).length} stages</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="application-name">Full name</label>
              <input id="application-name" name="name" autoComplete="name" className="input" defaultValue={user.name} required />
            </div>
            <div>
              <label className="label" htmlFor="application-phone">Phone</label>
              <input id="application-phone" name="phone" type="tel" autoComplete="tel" className="input" placeholder="+92 300 1234567" />
            </div>
            <div>
              <label className="label" htmlFor="application-university">University</label>
              <input id="application-university" name="university" autoComplete="organization" className="input" placeholder="e.g. LUMS" />
            </div>
            <div>
              <label className="label" htmlFor="application-degree">Degree</label>
              <input id="application-degree" name="degree" autoComplete="off" className="input" placeholder="e.g. Computer Science" />
            </div>
            <div>
              <label className="label" htmlFor="application-grad-year">Graduation year</label>
              <input id="application-grad-year" name="gradYear" type="number" inputMode="numeric" min="1950" max="2100" autoComplete="off" className="input" placeholder="2026" />
            </div>
            <div>
              <label className="label" htmlFor="application-gpa">CGPA</label>
              <input id="application-gpa" name="gpa" type="number" inputMode="decimal" min="0" max="10" step="0.01" autoComplete="off" className="input" placeholder="3.6" />
            </div>
            <div>
              <label className="label" htmlFor="application-linkedin">LinkedIn</label>
              <input id="application-linkedin" name="linkedin" type="url" inputMode="url" autoComplete="url" className="input" placeholder="https://linkedin.com/in/example" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="application-screening">Screening answer (why are you a good fit?)</label>
            <textarea id="application-screening" name="screening" autoComplete="off" className="input" rows={3} />
          </div>
          <div>
            <label className="label" htmlFor="application-cv">CV — upload PDF / DOC / DOCX, or paste text</label>
            <input id="application-cv" type="file" name="cvFile" accept=".pdf,.doc,.docx,.txt" aria-describedby="application-cv-help" className="input" />
            <p id="application-cv-help" className="text-xs text-slate-400 mt-1">Maximum 10 MB. Files are stored privately and parsed server-side.</p>
            <label className="sr-only" htmlFor="application-cv-text">Paste CV text</label>
            <textarea id="application-cv-text" name="cvText" autoComplete="off" className="input font-mono text-xs mt-2" rows={8} placeholder="…or paste your CV text here as a fallback." />
          </div>
          <button type="submit" className="btn-primary w-full">Submit application</button>
        </form>
      </Card>
    </div>
  );
}
