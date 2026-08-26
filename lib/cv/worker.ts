import { prisma, j, uj } from "@/lib/db";
import { parseCv, scoreParsedCv, extractRequiredFromJd } from "@/lib/ai/parseCv";
import { extractTextFromBuffer } from "@/lib/cv/extract";
import { readCvFile } from "@/lib/cv/storage";
import { createNotification } from "@/lib/notifications";

const MAX_RETRIES = 3;
const STALE_AFTER_MS = 10 * 60 * 1000;

// Claims and processes one queue item. The compare-and-update claim prevents
// two worker instances from scoring the same resume at the same time.
export async function processCvJob(jobId: string) {
  const claim = await prisma.cvJob.updateMany({
    where: { id: jobId, status: "QUEUED" },
    data: { status: "PROCESSING", retryCount: { increment: 1 }, attempts: { increment: 1 }, error: null },
  });
  if (claim.count !== 1) return { processed: false };

  const job = await prisma.cvJob.findUnique({
    where: { id: jobId },
    include: { application: { include: { drive: true } } },
  });
  if (!job) return { processed: false };

  try {
    const buf = await readCvFile(job.storagePath);
    const text = await extractTextFromBuffer(buf, job.fileName, job.fileType);
    const app = job.application;
    const submitted = uj<Record<string, any>>(app.extractedCv) || {};
    const required = extractRequiredFromJd(app.drive.jobDescription);
    const fallbackText = [submitted.name, submitted.email, submitted.phone, submitted.university, submitted.degree, submitted.screening]
      .filter(Boolean)
      .join("\n");
    const parsed = await parseCv(text.trim() || fallbackText, required, []);
    const hydrated = {
      ...parsed,
      name: parsed.name || submitted.name,
      email: parsed.email || submitted.email,
      phone: parsed.phone || submitted.phone,
      university: parsed.university || submitted.university,
      degree: parsed.degree || submitted.degree,
      gradYear: parsed.gradYear || submitted.gradYear,
      gpa: parsed.gpa ?? submitted.gpa,
    };
    const configuredTiers = await prisma.universityTier.findMany();
    const university = (hydrated.university || "").toLowerCase();
    const configuredTier = university ? configuredTiers.find((tier) => {
      const name = tier.name.toLowerCase();
      return university === name || university.includes(name) || name.includes(university);
    }) : undefined;
    const { components, cvScore } = scoreParsedCv(hydrated, {
      requiredSkills: required,
      preferredSkills: [],
      universityScoreOverride: configuredTier?.score,
    });
    // CV screening belongs to the drive intake pool, not to a funnel. A PASS
    // makes the candidate eligible for staff selection; it never advances them.
    const threshold = app.drive.cvPassThreshold;
    const cvResult = cvScore >= threshold ? "PASS" : "FAIL";
    const extracted = {
      ...submitted,
      ...hydrated,
      components,
      cvScore,
      requiredSkills: required,
      matched: hydrated.matchedSkills,
      missing: hydrated.missingSkills,
      extractionState: text.trim() ? "TEXT_EXTRACTED" : "APPLICATION_FIELDS_FALLBACK",
      scoringState: "AUTOMATIC_THRESHOLD_APPLIED",
      threshold,
    };

    await prisma.$transaction(async (tx) => {
      await tx.application.update({
        where: { id: app.id },
        data: {
          cvScore,
          cvResult,
          extractedCv: j(extracted),
          currentStage: "CV_SCREENING",
          phaseReleased: false,
          status: "HOLD",
          stageHistory: j([
            ...(uj<any[]>(app.stageHistory || "[]")),
            {
              stage: "CV_SCREENING",
              status: cvResult,
              at: new Date().toISOString(),
              note: `CV scored ${cvScore}/100 against drive threshold ${threshold}: ${cvResult}; held in the drive applicant pool for staff selection`,
            },
          ]),
          scores: j({ ...(uj<Record<string, number>>(app.scores || "{}")), CV_SCREENING: cvScore }),
        },
      });
      await tx.cvJob.update({ where: { id: jobId }, data: { status: "COMPLETED", extractedText: text } });
      await createNotification(
        {
          userId: app.candidateId,
          type: "CV_SCORED",
          message: `Your CV screening result is ${cvResult}. The recruitment team will contact you if you are selected for an assessment path.`,
          relatedAppId: app.id,
        },
        tx,
      );
    });
    return { processed: true, status: "COMPLETED" as const };
  } catch (error) {
    const current = await prisma.cvJob.findUnique({ where: { id: jobId } });
    const retryCount = current?.retryCount ?? MAX_RETRIES;
    const status = retryCount >= MAX_RETRIES ? "FAILED" : "QUEUED";
    await prisma.cvJob.update({
      where: { id: jobId },
      data: { status, error: error instanceof Error ? error.message.slice(0, 1000) : "CV processing failed" },
    });
    return { processed: true, status };
  }
}

export async function processDueCvJobs(limit = 5) {
  await prisma.cvJob.updateMany({
    where: { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } },
    data: { status: "QUEUED", error: "Recovered stale worker claim" },
  });
  const jobs = await prisma.cvJob.findMany({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 25)),
  });
  const results = [];
  for (const job of jobs) results.push(await processCvJob(job.id));
  return { found: jobs.length, results };
}
