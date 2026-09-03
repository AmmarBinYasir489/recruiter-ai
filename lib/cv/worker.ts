import { prisma, j, uj } from "@/lib/db";
import { parseCv, scoreParsedCv, extractSkillRequirementsFromJd } from "@/lib/ai/parseCv";
import { extractTextFromBuffer } from "@/lib/cv/extract";
import { ocrCvDocument } from "@/lib/cv/ocr";
import { readCvFile } from "@/lib/cv/storage";
import { createNotification } from "@/lib/notifications";
import { DEFAULT_CGPA } from "@/lib/engine/cgpa";
import { cleanSkills } from "@/lib/jobSkills";
import { injectionWarnings } from "@/lib/ai/security";
import { candidatePlaceholderName } from "@/lib/publicApplications";

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
    const nativeText = await extractTextFromBuffer(buf, job.fileName, job.fileType);
    const ocr = await ocrCvDocument(buf, job.fileType, nativeText);
    const app = job.application;
    const submitted = uj<Record<string, any>>(app.extractedCv) || {};
    const approved = uj<{ cvSkills?: { required: string[]; preferred: string[] } }>(app.drive.rubricConfig)?.cvSkills;
    const requirements = approved ? { required: cleanSkills(approved.required), preferred: cleanSkills(approved.preferred) } : extractSkillRequirementsFromJd(app.drive.jobDescription);
    const required = requirements.required;
    const parserText = ocr.text.trim();
    if (parserText.length < 40) {
      throw new Error("The CV could not be read. A readable PDF/DOCX or working OCR provider is required; no profile score was generated.");
    }
    // Stage 1 produces a faithful text transcription; stage 2 converts that
    // text into validated structured evidence for scoring.
      const warnings = injectionWarnings(nativeText + "\n" + parserText);
      if (warnings.length) {
        const safeScores = uj<Record<string, unknown>>(app.scores) || {};
        delete safeScores.CV_SCREENING;
        await prisma.$transaction(async (tx) => {
          await tx.application.update({ where: { id: app.id }, data: { cvScore: null, scores: j(safeScores), cvResult: "HOLD", status: "HOLD", phaseReleased: false, extractedCv: j({ ...submitted, validationWarnings: warnings, securityReviewRequired: true }) } });
        await tx.cvJob.update({ where: { id: jobId }, data: { status: "FAILED", error: warnings[0], extractedText: parserText } });
      });
      return { processed: true, status: "FAILED" as const };
    }
    const parsed = await parseCv(parserText, required, requirements.preferred);
    const hydrated = {
      ...parsed,
      name: parsed.name || submitted.name,
      email: parsed.email || submitted.email,
      gpa: parsed.gpa ?? DEFAULT_CGPA,
      gpaScale: parsed.gpaScale ?? 4,
      gpaAssumed: parsed.gpaAssumed ?? (parsed.gpa == null),
    };
    const configuredTiers = await prisma.universityTier.findMany();
    const university = (hydrated.university || "").toLowerCase();
    const configuredTier = university ? configuredTiers.find((tier) => {
      const name = tier.name.toLowerCase();
      return university === name || university.includes(name) || name.includes(university);
    }) : undefined;
    const { components, cvScore, relevance } = scoreParsedCv(hydrated, {
      jobTitle: app.drive.name,
      requiredSkills: required,
      preferredSkills: requirements.preferred,
      universityScoreOverride: configuredTier?.score,
    });
    // CV screening belongs to the drive intake pool, not to a funnel. A PASS
    // makes the candidate eligible for staff selection; it never advances them.
    const threshold = app.drive.cvPassThreshold;
    const cvResult = "HOLD";
    const extracted = {
      ...submitted,
      ...hydrated,
      components,
      relevance,
      candidateQualityScore: Math.round((components.skills * 30 + components.projects * 25 + components.experience * 15 + components.other * 10) / 80),
      fitSummary: `${hydrated.fitSummary} Role relevance: ${relevance.projects.filter((item) => item.relevance > 0).length} project(s) and ${relevance.experience.filter((item) => item.relevance > 0).length} work entries contain matching evidence. Unrelated entries receive no evidence credit.`,
      cvScore,
      requiredSkills: required,
      preferredSkills: requirements.preferred,
      matched: hydrated.matchedSkills,
      missing: hydrated.missingSkills,
      extractionState: hydrated.extractionMethod || "TEXT_EXTRACTED",
      textExtractionMethod: ocr.method,
      scoringState: "SCORED_AWAITING_STAFF_DECISION",
      threshold,
    };

    await prisma.$transaction(async (tx) => {
      if (parsed.name && typeof parsed.name === "string") {
        // Replace only the signup placeholder; preserve deliberately edited names.
        const account = await tx.user.findUnique({ where: { id: app.candidateId }, select: { email: true } });
        if (account) await tx.user.updateMany({ where: { id: app.candidateId, name: candidatePlaceholderName(account.email) }, data: { name: parsed.name.slice(0, 120) } });
      }
      await tx.application.update({
        where: { id: app.id },
        data: {
          cvScore,
          cvResult,
          extractedCv: j(extracted),
          ...(app.currentStage === "CV_SCREENING" ? { phaseReleased: false, status: "HOLD" } : {}),
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
      await tx.cvJob.update({ where: { id: jobId }, data: { status: "COMPLETED", extractedText: parserText } });
      await createNotification(
        {
          userId: app.candidateId,
          type: "CV_SCORED",
          message: "Your CV screening is complete. Your application is now with the recruitment team for assessment-path selection.",
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
