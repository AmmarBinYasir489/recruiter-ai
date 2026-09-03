import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { prisma, uj } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notification = await prisma.notification.findFirst({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, read: true, createdAt: true },
  });
  let candidateState: unknown = null;
  let staffState: unknown = null;
  if (user.role === "candidate") {
    const applications = await prisma.application.findMany({
      where: { candidateId: user.id, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        currentStage: true,
        phaseReleased: true,
        cvResult: true,
        cvScore: true,
        funnel: { select: { stages: true } },
        // This is only a cache-busting watermark. Never expose subjective or
        // internal assessment decisions/scores through the polling endpoint.
        results: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { id: true, createdAt: true } },
        cvJobs: { orderBy: { updatedAt: "desc" }, take: 1, select: { id: true, status: true, updatedAt: true } },
      },
    });
    candidateState = applications.map((application) => {
      const stages = application.funnel ? uj<any[]>(application.funnel.stages) || [] : [];
      const current = stages.find((stage) => stage.type === application.currentStage);
      const opensAt = current?.opensAt ? new Date(current.opensAt) : null;
      return { ...application, releaseReady: application.phaseReleased && Boolean(opensAt && opensAt.getTime() <= Date.now()) };
    });
  }
  if (user.role === "recruiter" || user.role === "admin") {
    const applicationScope = user.role === "admin" ? {} : { application: { drive: { ownerId: user.id } } };
    const driveScope = user.role === "admin" ? {} : { application: { drive: { ownerId: user.id } } };
    const [result, cvJob, attempt] = await Promise.all([
      prisma.assessmentResult.findFirst({ where: applicationScope, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, status: true, normalized: true, gradedAt: true, createdAt: true } }),
      prisma.cvJob.findFirst({ where: driveScope, orderBy: { updatedAt: "desc" }, select: { id: true, status: true, updatedAt: true } }),
      prisma.assessmentAttempt.findFirst({ where: applicationScope, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, status: true, submittedAt: true, createdAt: true } }),
    ]);
    staffState = { result, cvJob, attempt };
  }
  // Watermark is opaque: never serialize CV scores or internal data into a candidate response.
  const watermark = createHash("sha256").update(JSON.stringify({ notification, candidateState, staffState })).digest("hex");
  return NextResponse.json({ watermark }, { headers: { "Cache-Control": "no-store" } });
}
