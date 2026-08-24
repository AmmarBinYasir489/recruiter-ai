"use server";

import { prisma, j, uj } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { reviewerCanGrade } from "@/lib/reviewerAccess";
import { createNotification } from "@/lib/notifications";
import { scoreCodingByRubric } from "@/lib/engine/coding";
import { scoreEssayByRubric } from "@/lib/engine/essay";
import { scorePromptByRubric } from "@/lib/engine/prompt";

export async function gradeAssessmentAction(resultId: string, formData: FormData) {
  const user = await requireRole("reviewer", "admin");
  const result = await prisma.assessmentResult.findUnique({
    where: { id: resultId },
    include: { application: { include: { drive: true, funnel: true } } },
  });
  if (!result) return { error: "Not found." };
  if (!reviewerCanGrade(user, result.type, result.application.funnel)) return { error: "Not assigned to this assessment." };

  const notes = String(formData.get("notes") || "");
  const num = (k: string) => Number(formData.get(k) || 0);
  let normalized = 0;
  if (result.type === "CODING") {
    normalized = scoreCodingByRubric({
      correctness: num("correctness"), codeQuality: num("codeQuality"),
      logic: num("logic"), efficiency: num("efficiency"), bestPractices: num("bestPractices"),
    });
  } else if (result.type === "ESSAY") {
    normalized = scoreEssayByRubric({
      understanding: num("understanding"), communication: num("communication"),
      criticalThinking: num("criticalThinking"), problemSolving: num("problemSolving"),
      domainKnowledge: num("domainKnowledge"),
    });
  } else if (result.type === "PROMPT") {
    normalized = scorePromptByRubric({
      promptDesign: num("promptDesign"), clarity: num("clarity"),
      structure: num("structure"), reasoning: num("reasoning"), outcome: num("outcome"),
    });
  } else {
    normalized = num("score");
  }

  const status = "PENDING";

  const app = result.application;
  const scores = uj<Record<string, number>>(app.scores) || {};
  scores[result.type] = normalized;
  // Gating: do NOT auto-advance. The candidate stays on this stage and awaits
  // the recruiter's explicit issuance of the next phase (or rejection).
  await prisma.$transaction(async (tx) => {
    await tx.assessmentResult.update({
      where: { id: resultId },
      data: { normalized, status, notes, gradedBy: user.id, gradedAt: new Date() },
    });
    await tx.application.update({
      where: { id: app.id },
      data: {
        scores: j(scores), currentStage: result.type, phaseReleased: false, status: "IN_PROGRESS",
        stageHistory: j([...(uj<any[]>(app.stageHistory) || []), { stage: result.type, status, at: new Date().toISOString(), note: `Graded by reviewer: ${normalized}/100` }]),
      },
    });
    await createNotification({
      userId: app.candidateId,
      type: "GRADE",
      message: `Your ${result.type} was graded: ${normalized}/100. The recruitment team will apply the threshold and notify you about the next step.`,
      relatedAppId: app.id,
    }, tx);
    await tx.auditLog.create({ data: { actorId: user.id, action: "GRADE", meta: j({ resultId, type: result.type, normalized, status }) } });
  });

  return { ok: true, normalized, status };
}
