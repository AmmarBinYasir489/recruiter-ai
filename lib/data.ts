import { prisma, uj } from "./db";
import type { CandidateRecord } from "./engine/search";

export async function getCandidateRecords(driveId?: string, ownerId?: string): Promise<CandidateRecord[]> {
  const apps = await prisma.application.findMany({
    where: {
      ...(driveId ? { driveId } : {}),
      ...(ownerId ? { drive: { ownerId } } : {}),
    },
    select: {
      id: true,
      candidateId: true,
      driveId: true,
      status: true,
      funnelId: true,
      phaseReleased: true,
      currentStage: true,
      cvScore: true,
      cvResult: true,
      extractedCv: true,
      stageHistory: true,
      scores: true,
      appliedAt: true,
      createdAt: true,
      candidate: { select: { name: true, email: true } },
      drive: { select: { name: true } },
      funnel: { select: { name: true } },
      results: {
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, status: true, integrityLevel: true },
      },
      onsiteInvites: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
    orderBy: { appliedAt: "desc" },
  });

  const trackCounts = new Map<string, number>();
  for (const app of apps) {
    const key = `${app.candidateId}:${app.driveId}`;
    trackCounts.set(key, (trackCounts.get(key) || 0) + 1);
  }

  return apps.map((a) => {
    const scores = uj<Record<string, number>>(a.scores) || {};
    const extracted = uj<any>(a.extractedCv) || {};
    const history = uj<any[]>(a.stageHistory) || [];
    const ccat = scores.CCAT;
    const mtt = scores.MTT;
    const latestGame = a.results.find((result) => result.type === "GAMES");
    const latestManual = a.results.find((result) => ["CODING", "ESSAY", "PROMPT", "RAT", "ENGLISH_SPEAKING"].includes(result.type));
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
      funnelId: a.funnelId ?? undefined,
      funnelName: a.funnel?.name ?? undefined,
      trackCount: trackCounts.get(`${a.candidateId}:${a.driveId}`) || 1,
      phaseReleased: a.phaseReleased,
      scores,
      latestResultId: a.results[0]?.id,
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
