import type { CandidateFilter } from "./types";
export type { CandidateFilter } from "./types";

// A flattened candidate record used for server-side search/filter.
// Filtering runs over the COMPLETE dataset, not just what's on screen.
export interface CandidateRecord {
  id: string; // application id
  candidateGroupKey?: string; // one visible row per candidate + drive
  isPrimaryTrack?: boolean;
  groupRefreshKey?: string;
  applicationId: string;
  name: string;
  email: string;
  phone: string;
  driveId: string;
  driveName: string;
  status: string;
  funnelId?: string;
  funnelName?: string;
  scoreMode?: string;
  totalScore?: number;
  gradedCount?: number;
  assessmentCount?: number;
  scoreState?: string;
  trackCount?: number;
  phaseReleased?: boolean;
  scores?: Record<string, number>;
  overall?: { total: number; complete: boolean; gradedCount: number; assessmentCount: number };
  latestResultId?: string;
  currentStage?: string;
  previousStage?: string;
  university?: string;
  degree?: string;
  gradYear?: number;
  gpa?: number;
  cvScore?: number;
  cvResult?: string;
  ccat?: number;
  mtt?: number;
  gameStatus?: string;
  manualReviewStatus?: string;
  onsiteRsvp?: "ACCEPTED" | "DECLINED" | "PENDING";
  finalDecision?: string;
  integrityFlag?: boolean;
  appliedAt: string;
}

function matchesText(c: CandidateRecord, text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  return (
    c.name.toLowerCase().includes(t) ||
    c.email.toLowerCase().includes(t) ||
    c.phone.toLowerCase().includes(t) ||
    c.applicationId.toLowerCase().includes(t) ||
    c.driveName.toLowerCase().includes(t)
  );
}

function inRange(v: number | undefined, min?: number, max?: number): boolean {
  if (v === undefined) return min === undefined && max === undefined; // unknown matches only when no range set
  if (min !== undefined && v < min) return false;
  if (max !== undefined && v > max) return false;
  return true;
}

export function filterCandidates(
  candidates: CandidateRecord[],
  f: CandidateFilter,
): CandidateRecord[] {
  return candidates.filter((c) => {
    if (f.driveId && c.driveId !== f.driveId) return false;
    if (f.search && !matchesText(c, f.search)) return false;
    if (f.status && f.status.length && !f.status.includes(c.status as never)) return false;
    if (f.stage && f.stage.length) {
      const inStages = [c.currentStage, c.previousStage].filter(Boolean) as string[];
      if (!inStages.some((s) => f.stage!.includes(s as never))) return false;
    }
    if (f.university && f.university.length && (!c.university || !f.university.some((value) => c.university!.toLowerCase().includes(value.toLowerCase())))) return false;
    if (f.degree && f.degree.length && (!c.degree || !f.degree.some((value) => c.degree!.toLowerCase().includes(value.toLowerCase())))) return false;
    if (f.gradYearMin !== undefined && (c.gradYear === undefined || c.gradYear < f.gradYearMin)) return false;
    if (f.gradYearMax !== undefined && (c.gradYear === undefined || c.gradYear > f.gradYearMax)) return false;
    if (!inRange(c.gpa, f.gpaMin, f.gpaMax)) return false;
    if (!inRange(c.cvScore, f.cvMin, f.cvMax)) return false;
    if (!inRange(c.ccat, f.ccatMin, f.ccatMax)) return false;
    if (!inRange(c.mtt, f.mttMin, f.mttMax)) return false;
    if (f.gameStatus && f.gameStatus.length && (!c.gameStatus || !f.gameStatus.includes(c.gameStatus as never))) return false;
    if (
      f.manualReviewStatus &&
      f.manualReviewStatus.length &&
      (!c.manualReviewStatus || !f.manualReviewStatus.includes(c.manualReviewStatus as never))
    )
      return false;
    if (f.onsiteRsvp && f.onsiteRsvp.length && (!c.onsiteRsvp || !f.onsiteRsvp.includes(c.onsiteRsvp))) return false;
    if (
      f.finalDecision &&
      f.finalDecision.length &&
      (!c.finalDecision || !f.finalDecision.includes(c.finalDecision as never))
    )
      return false;
    if (f.integrityFlag && !c.integrityFlag) return false;
    return true;
  });
}

export function sortCandidates(
  candidates: CandidateRecord[],
  sortBy: keyof CandidateRecord = "appliedAt",
  dir: "asc" | "desc" = "desc",
): CandidateRecord[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...candidates].sort((a, b) => {
    const av = a[sortBy];
    const bv = b[sortBy];
    if (av === undefined && bv === undefined) return 0;
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
    return String(av).localeCompare(String(bv)) * mult;
  });
}

export interface PageResult {
  items: CandidateRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export function paginate(candidates: CandidateRecord[], page = 1, pageSize = 25): PageResult {
  const total = candidates.length;
  const start = (page - 1) * pageSize;
  return { items: candidates.slice(start, start + pageSize), total, page, pageSize };
}

export function toCsv(candidates: CandidateRecord[], columns: (keyof CandidateRecord)[]): string {
  const header = columns
    .map((col) => `"${String(col).replace(/"/g, '""')}"`)
    .join(",");
  const rows = candidates.map((c) =>
    columns
      .map((col) => {
        const v = c[col];
          const raw = v === undefined ? "" : String(v);
          // Prevent spreadsheet applications from interpreting exported user data as a formula.
          const s = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
        return `"${s.replace(/"/g, '""')}"`;
      })
      .join(","),
  );
  return [header, ...rows].join("\n");
}
