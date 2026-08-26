import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match || process.env[match[1]]) continue;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  process.env[match[1]] = value;
}

const prisma = new PrismaClient();
const weights = { academics: 10, universityDegree: 10, skills: 30, projects: 25, experience: 15, other: 10 };
const scoreComponents = (components) => Math.round(Math.max(0, Math.min(100,
  Object.entries(weights).reduce((sum, [key, weight]) => sum + Number(components[key] || 0) * weight, 0) / 100,
)));

try {
  const beforeQuestions = await prisma.question.groupBy({ by: ["bank"], _count: { _all: true }, orderBy: { bank: "asc" } });
  const funnels = await prisma.funnel.findMany();
  const applications = await prisma.application.findMany({ include: { drive: true, funnel: true } });
  let funnelsUpdated = 0;
  let cvScoresUpdated = 0;
  let finalStatesUpdated = 0;

  await prisma.$transaction(async (tx) => {
    for (const funnel of funnels) {
      const original = JSON.parse(funnel.stages || "[]");
      const kept = original.filter((stage) => stage.type !== "MANUAL_REVIEW");
      const removedIds = new Set(original.filter((stage) => stage.type === "MANUAL_REVIEW").map((stage) => stage.id));
      const normalized = kept.map((stage, index) => ({
        ...stage,
        order: index + 1,
        ...(removedIds.has(stage.passTargetStageId) ? { passAction: "NEXT", passTargetStageId: undefined } : {}),
        ...(removedIds.has(stage.failTargetStageId) ? { failAction: "HOLD", failTargetStageId: undefined } : {}),
        ...(stage.type === "ONSITE" && stage.passAction === "OFFER" ? { passAction: "NEXT" } : {}),
      }));
      if (JSON.stringify(original) !== JSON.stringify(normalized)) {
        await tx.funnel.update({ where: { id: funnel.id }, data: { stages: JSON.stringify(normalized) } });
        funnelsUpdated++;
      }
    }

    for (const app of applications) {
      const data = {};
      let extracted;
      try { extracted = JSON.parse(app.extractedCv || "{}"); } catch { extracted = {}; }
      if (extracted.components && typeof extracted.components === "object") {
        const corrected = scoreComponents(extracted.components);
        let funnelStages = [];
        try { funnelStages = JSON.parse(app.funnel?.stages || "[]"); } catch { funnelStages = []; }
        const threshold = Number(funnelStages.find((stage) => stage.type === "CV_SCREENING")?.passScore ?? app.drive.cvPassThreshold);
        const correctedResult = corrected >= threshold ? "PASS" : "FAIL";
        if (corrected !== app.cvScore || correctedResult !== app.cvResult) {
          let scores;
          try { scores = JSON.parse(app.scores || "{}"); } catch { scores = {}; }
          let history;
          try { history = JSON.parse(app.stageHistory || "[]"); } catch { history = []; }
          scores.CV_SCREENING = corrected;
          extracted.cvScore = corrected;
          extracted.threshold = threshold;
          data.cvScore = corrected;
          data.cvResult = correctedResult;
          data.scores = JSON.stringify(scores);
          data.extractedCv = JSON.stringify(extracted);
          data.stageHistory = JSON.stringify([...history, { stage: "CV_SCREENING", status: correctedResult, at: new Date().toISOString(), note: `CV score corrected to ${corrected}/100 after scoring-formula repair; threshold ${threshold}` }]);
          cvScoresUpdated++;
        }
      }
      if (app.currentStage === "MANUAL_REVIEW" || (app.currentStage === "FINAL" && app.status === "IN_PROGRESS")) {
        data.currentStage = "FINAL";
        data.phaseReleased = false;
        data.status = "HOLD";
        finalStatesUpdated++;
      }
      if (Object.keys(data).length) await tx.application.update({ where: { id: app.id }, data });
    }
  });

  const afterQuestions = await prisma.question.groupBy({ by: ["bank"], _count: { _all: true }, orderBy: { bank: "asc" } });
  const before = Object.fromEntries(beforeQuestions.map((row) => [row.bank, row._count._all]));
  const after = Object.fromEntries(afterQuestions.map((row) => [row.bank, row._count._all]));
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Question-bank counts changed; transaction must be investigated.");
  console.log(JSON.stringify({ ok: true, funnelsUpdated, cvScoresUpdated, finalStatesUpdated, questionBanksPreserved: after }));
} finally {
  await prisma.$disconnect();
}
