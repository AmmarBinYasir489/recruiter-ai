import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { collapseCandidateTracks, getCandidateRecords } from "@/lib/data";
import { filterCandidates, sortCandidates, toCsv, type CandidateFilter } from "@/lib/engine/search";

export const dynamic = "force-dynamic";

function str(v: string | string[] | null | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}
function num(v: string | string[] | null | undefined): number | undefined {
  const s = str(v);
  return s === undefined || s === "" ? undefined : Number(s);
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "recruiter" && user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const filter: CandidateFilter = {
    driveId: str(sp.get("driveId")),
    search: str(sp.get("search")),
    status: str(sp.get("status")) ? [str(sp.get("status")) as any] : undefined,
    stage: str(sp.get("stage")) ? [str(sp.get("stage")) as any] : undefined,
    university: str(sp.get("university")) ? [str(sp.get("university"))!] : undefined,
    degree: str(sp.get("degree")) ? [str(sp.get("degree"))!] : undefined,
    gradYearMin: num(sp.get("gradYearMin")),
    gradYearMax: num(sp.get("gradYearMax")),
    gpaMin: num(sp.get("gpaMin")),
    gpaMax: num(sp.get("gpaMax")),
    cvMin: num(sp.get("cvMin")),
    cvMax: num(sp.get("cvMax")),
    ccatMin: num(sp.get("ccatMin")),
    ccatMax: num(sp.get("ccatMax")),
    mttMin: num(sp.get("mttMin")),
    mttMax: num(sp.get("mttMax")),
    gameStatus: str(sp.get("gameStatus")) ? [str(sp.get("gameStatus")) as any] : undefined,
    manualReviewStatus: str(sp.get("manualReviewStatus")) ? [str(sp.get("manualReviewStatus")) as any] : undefined,
    onsiteRsvp: str(sp.get("onsiteRsvp")) ? [str(sp.get("onsiteRsvp")) as any] : undefined,
    integrityFlag: sp.get("integrityFlag") ? true : undefined,
    finalDecision: str(sp.get("finalDecision")) ? [str(sp.get("finalDecision")) as any] : undefined,
  };

  const ownedDriveIds = user.role === "recruiter"
    ? (await prisma.drive.findMany({ where: { ownerId: user.id }, select: { id: true } })).map((drive) => drive.id)
    : null;
  if (filter.driveId && ownedDriveIds && !ownedDriveIds.includes(filter.driveId)) {
    return new Response("Forbidden", { status: 403 });
  }

  const records = await getCandidateRecords(filter.driveId);
  const scopedRecords = ownedDriveIds ? records.filter((record) => ownedDriveIds.includes(record.driveId)) : records;
  const filtered = sortCandidates(collapseCandidateTracks(filterCandidates(scopedRecords, filter)), "appliedAt", "desc");
  const csv = toCsv(filtered, [
    "applicationId", "name", "email", "phone", "driveName", "status",
    "currentStage", "university", "degree", "gradYear", "gpa",
    "cvScore", "ccat", "mtt", "finalDecision",
  ]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="candidates.csv"',
    },
  });
}
