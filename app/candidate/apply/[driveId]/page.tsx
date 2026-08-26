import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, LinkButton } from "@/components/ui";
import { applyAction } from "@/app/candidate/actions";

export const dynamic = "force-dynamic";

export default async function ApplyPage({ params: paramsPromise }: { params: Promise<{ driveId: string }> }) {
  const params = await paramsPromise;
  const user = await getCurrentUser();
  if (!user || user.role !== "candidate") return null;
  const drive = await prisma.drive.findUnique({ where: { id: params.driveId } });
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

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-ink-900">{drive.name}</h1>
      <p className="text-slate-500 mb-1">{drive.location} · Deadline {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(drive.deadline)}</p>

      <Card>
        <form action={applyAction.bind(null, drive.id)} className="space-y-4">
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
            <label className="label" htmlFor="application-cv">CV — upload PDF / DOC / DOCX</label>
            <input id="application-cv" type="file" name="cvFile" accept=".pdf,.doc,.docx" aria-describedby="application-cv-help" className="input" required />
            <p id="application-cv-help" className="text-xs text-slate-400 mt-1">Maximum 10 MB. Files are stored privately and parsed server-side.</p>
          </div>
          <button type="submit" className="btn-primary w-full">Submit application</button>
        </form>
      </Card>
    </div>
  );
}
