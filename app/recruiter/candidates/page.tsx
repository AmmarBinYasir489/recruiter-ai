import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { collapseCandidateTracks, getCandidateRecords } from "@/lib/data";
import {
  filterCandidates,
  sortCandidates,
  paginate,
  type CandidateFilter,
} from "@/lib/engine/search";
import { Card } from "@/components/ui";
import { CandidateAccordion } from "@/components/candidate/CandidateAccordion";
import { buildCandidateListViews } from "@/lib/candidateView";
import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
function num(v: string | string[] | undefined): number | undefined {
  const s = str(v);
  return s === undefined || s === "" ? undefined : Number(s);
}

function parseFilters(sp: SP): CandidateFilter {
  return {
    driveId: str(sp.driveId),
    search: str(sp.search),
    status: str(sp.status) ? [str(sp.status) as any] : undefined,
    stage: str(sp.stage) ? [str(sp.stage) as any] : undefined,
    university: str(sp.university) ? [str(sp.university)!] : undefined,
    degree: str(sp.degree) ? [str(sp.degree)!] : undefined,
    gradYearMin: num(sp.gradYearMin),
    gradYearMax: num(sp.gradYearMax),
    gpaMin: num(sp.gpaMin),
    gpaMax: num(sp.gpaMax),
    cvMin: num(sp.cvMin),
    cvMax: num(sp.cvMax),
    ccatMin: num(sp.ccatMin),
    ccatMax: num(sp.ccatMax),
    mttMin: num(sp.mttMin),
    mttMax: num(sp.mttMax),
    gameStatus: str(sp.gameStatus) ? [str(sp.gameStatus) as any] : undefined,
    manualReviewStatus: str(sp.manualReviewStatus) ? [str(sp.manualReviewStatus) as any] : undefined,
    onsiteRsvp: str(sp.onsiteRsvp) ? [str(sp.onsiteRsvp) as any] : undefined,
    integrityFlag: sp.integrityFlag ? true : undefined,
    finalDecision: str(sp.finalDecision) ? [str(sp.finalDecision) as any] : undefined,
  };
}

export default async function CandidatesPage({ searchParams: searchParamsPromise }: { searchParams: Promise<SP> }) {
  const searchParams = await searchParamsPromise;
  const user = await requireRole("recruiter", "admin");
  // Recruiters only see drives they own; admins see everything.
  const isRecruiter = user?.role === "recruiter";
  const filter = parseFilters(searchParams);
  const [drives, scoped] = await Promise.all([
    prisma.drive.findMany({
      where: isRecruiter ? { ownerId: user.id } : undefined,
      select: {
        id: true,
        name: true,
        funnels: { where: { published: true }, orderBy: { version: "desc" }, select: { id: true, name: true, version: true } },
      },
    }),
    getCandidateRecords(filter.driveId, isRecruiter ? user.id : undefined),
  ]);
  const filteredTracks = filterCandidates(scoped, filter);
  const filtered = collapseCandidateTracks(filteredTracks);
  const candidateTotal = collapseCandidateTracks(scoped).length;
  const sorted = sortCandidates(filtered, (str(searchParams.sortBy) as any) || "appliedAt", (str(searchParams.dir) as any) || "desc");
  const page = paginate(sorted, Number(str(searchParams.page) || 1), 25);

  const qs = new URLSearchParams();
  Object.entries(searchParams).forEach(([k, v]) => {
    const s = str(v);
    if (s) qs.set(k, s);
  });

  // Build full interactive workspaces for the current page's candidates.
  const funnelMap = new Map(drives.map((drive) => [drive.id, drive.funnels]));
  const views = buildCandidateListViews(page.items, funnelMap);

  return (
    <div>
      <AutoRefresh intervalMs={5000} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Candidates</h1>
        <span className="text-sm text-slate-500">{filtered.length} of {candidateTotal} match</span>
        <a href={`/api/recruiter/candidates?${qs.toString()}`} className="btn-ghost">Export CSV</a>
      </div>

      <div className="grid md:grid-cols-[260px_minmax(0,1fr)] gap-6">
        {/* Left filter panel */}
        <Card className="h-fit">
          <form className="space-y-3" method="get" action="/recruiter/candidates">
            <div>
              <label className="label">Search</label>
              <input name="search" className="input" placeholder="name / email / phone / app id" defaultValue={str(searchParams.search) || ""} />
            </div>
            <div>
              <label className="label">Drive</label>
              <select name="driveId" className="input" defaultValue={str(searchParams.driveId) || ""}>
                <option value="">All drives</option>
                {drives.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select name="status" className="input" defaultValue={str(searchParams.status) || ""}>
                <option value="">Any</option>
                {["HOLD", "SUBMITTED", "IN_PROGRESS", "REJECTED", "ARCHIVED", "OFFERED", "HIRED"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Current stage</label>
              <select name="stage" className="input" defaultValue={str(searchParams.stage) || ""}>
                <option value="">Any</option>
                {["CV_SCREENING", "CCAT", "MTT", "CODING", "ESSAY", "PROMPT", "GAMES", "ONSITE", "FINAL"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label className="label">University contains</label><input name="university" aria-label="University contains" className="input" defaultValue={str(searchParams.university) || ""} placeholder="e.g. NUST" /></div>
            <div><label className="label">Degree contains</label><input name="degree" aria-label="Degree contains" className="input" defaultValue={str(searchParams.degree) || ""} placeholder="e.g. Computer Science" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">Grad year from</label><input name="gradYearMin" type="number" className="input" defaultValue={str(searchParams.gradYearMin) || ""} /></div>
              <div><label className="label">Grad year to</label><input name="gradYearMax" type="number" className="input" defaultValue={str(searchParams.gradYearMax) || ""} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">GPA min</label><input name="gpaMin" type="number" step="0.01" className="input" defaultValue={str(searchParams.gpaMin) || ""} /></div>
              <div><label className="label">GPA max</label><input name="gpaMax" type="number" step="0.01" className="input" defaultValue={str(searchParams.gpaMax) || ""} /></div>
              <div><label className="label">CV min</label><input name="cvMin" type="number" className="input" defaultValue={str(searchParams.cvMin) || ""} /></div>
              <div><label className="label">CV max</label><input name="cvMax" type="number" className="input" defaultValue={str(searchParams.cvMax) || ""} /></div>
              <div><label className="label">CCAT min</label><input name="ccatMin" type="number" className="input" defaultValue={str(searchParams.ccatMin) || ""} /></div>
              <div><label className="label">CCAT max</label><input name="ccatMax" type="number" className="input" defaultValue={str(searchParams.ccatMax) || ""} /></div>
              <div><label className="label">MTT min</label><input name="mttMin" type="number" className="input" defaultValue={str(searchParams.mttMin) || ""} /></div>
              <div><label className="label">MTT max</label><input name="mttMax" type="number" className="input" defaultValue={str(searchParams.mttMax) || ""} /></div>
            </div>
            <div>
              <label className="label">Game result</label>
              <select name="gameStatus" aria-label="Game result" className="input" defaultValue={str(searchParams.gameStatus) || ""}><option value="">Any</option><option value="PASS">Pass</option><option value="FAIL">Fail</option><option value="PENDING">Pending</option></select>
            </div>
            <div>
              <label className="label">Manual review</label>
              <select name="manualReviewStatus" aria-label="Manual review" className="input" defaultValue={str(searchParams.manualReviewStatus) || ""}><option value="">Any</option><option value="MANUAL_REVIEW">Awaiting reviewer</option><option value="PENDING">Scored, decision pending</option><option value="PASS">Pass</option><option value="FAIL">Fail</option></select>
            </div>
            <div>
              <label className="label">Onsite RSVP</label>
              <select name="onsiteRsvp" aria-label="Onsite RSVP" className="input" defaultValue={str(searchParams.onsiteRsvp) || ""}><option value="">Any</option><option value="PENDING">Pending</option><option value="ACCEPTED">Accepted</option><option value="DECLINED">Declined</option></select>
            </div>
            <div>
              <label className="label">Final decision</label>
              <select name="finalDecision" className="input" defaultValue={str(searchParams.finalDecision) || ""}>
                <option value="">Any</option>
                <option value="PASS">Pass</option>
                <option value="FAIL">Fail</option>
                <option value="PENDING">Pending</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="integrityFlag" value="true" defaultChecked={!!searchParams.integrityFlag} /> Integrity flag only</label>
            <button className="btn-primary w-full">Apply filters</button>
          </form>
        </Card>

        {/* Candidate workspace (inline expansion, no navigation) */}
        <div className="min-w-0 w-full overflow-hidden">
          <CandidateAccordion views={views} />
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>Page {page.page} · {page.total} total · filtering runs on the full database.</span>
            <div className="flex gap-2">
              {page.page > 1 && <Link className="btn-ghost" href={`/recruiter/candidates?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(page.page - 1) }).toString()}`}>← Previous</Link>}
              {page.page * page.pageSize < page.total && <Link className="btn-ghost" href={`/recruiter/candidates?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(page.page + 1) }).toString()}`}>Next →</Link>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
