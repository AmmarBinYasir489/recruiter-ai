import { prisma, uj } from "./db";
import type { CandidateRecord } from "./engine/search";

export async function getCandidateRecords(driveId?: string): Promise<CandidateRecord[]> {
  const apps = await prisma.application.findMany({
    where: driveId ? { driveId } : {},
    include: { candidate: true, drive: true, results: { orderBy: { createdAt: "desc" } }, onsiteInvites: { orderBy: { createdAt: "desc" } } },
    orderBy: { appliedAt: "desc" },
  });

  return apps.map((a) => {
    const scores = uj<Record<string, number>>(a.scores) || {};
    const extracted = uj<any>(a.extractedCv) || {};
    const history = uj<any[]>(a.stageHistory) || [];
    const ccat = scores.CCAT;
    const mtt = scores.MTT;
    const latestGame = a.results.find((result) => result.type === "GAMES");
    const latestManual = a.results.find((result) => ["CODING", "ESSAY", "PROMPT", "RAT", "MANUAL_REVIEW"].includes(result.type));
    const onsite = a.onsiteInvites[0];
    return {
      id: a.id,
      applicationId: a.id.slice(0, 8).toUpperCase(),
      name: a.candidate.name,
      email: a.candidate.email,
      phone: extracted.phone || "",
      driveId: a.driveId,
      driveName: a.drive.name,
      status: a.status,
      currentStage: a.currentStage || undefined,
      previousStage: history.length >= 2 ? history[history.length - 2].stage : undefined,
      university: extracted.university || undefined,
      degree: extracted.degree || undefined,
      gradYear: extracted.gradYear,
      gpa: extracted.gpa,
      cvScore: a.cvScore ?? undefined,
      cvResult: a.cvResult ?? undefined,
      ccat,
      mtt,
      gameStatus: latestGame?.status,
      manualReviewStatus: latestManual?.status,
      onsiteRsvp: onsite ? (onsite.status === "ACCEPTED" || onsite.status === "DECLINED" ? onsite.status : "PENDING") : undefined,
      finalDecision:
        a.status === "REJECTED"
          ? "FAIL"
          : a.status === "OFFERED" || a.status === "HIRED"
            ? "PASS"
            : "PENDING",
      integrityFlag: a.results.some((result) => result.integrityLevel === "SUSPICIOUS" || result.integrityLevel === "PLAGIARIST"),
      appliedAt: (a.appliedAt ?? a.createdAt).toISOString(),
    };
  });
}
