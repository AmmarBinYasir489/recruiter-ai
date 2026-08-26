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
try {
  const [funnels, applications, ai] = await Promise.all([
    prisma.funnel.findMany({ select: { id: true, name: true, version: true, stages: true } }),
    prisma.application.findMany({ select: { id: true, currentStage: true, status: true, cvScore: true, cvResult: true, funnelId: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.aiSetting.findUnique({ where: { id: "singleton" } }),
  ]);
  console.log(JSON.stringify({
    funnels: funnels.map((funnel) => {
      const stages = JSON.parse(funnel.stages || "[]");
      return { id: funnel.id, name: funnel.name, version: funnel.version, stages: stages.map((stage) => stage.type), hasManualReview: stages.some((stage) => stage.type === "MANUAL_REVIEW") };
    }),
    applications,
    ai: ai ? { provider: ai.provider, model: ai.provider === "groq" ? process.env.GROQ_MODEL || null : process.env.GEMINI_MODEL || null, keyConfigured: Boolean(ai.apiKey || (ai.provider === "groq" ? process.env.GROQ_API_KEY : process.env.GEMINI_API_KEY)) } : { provider: process.env.AI_PROVIDER || "gemini", model: process.env.GEMINI_MODEL || process.env.GROQ_MODEL || null, keyConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY) },
  }));
} finally {
  await prisma.$disconnect();
}
