import fs from "node:fs";
import path from "node:path";
import { prisma, j } from "../lib/db";
import { selectAttemptQuestions } from "../lib/assessmentQuestions";

async function main() {
  const originals = JSON.parse(fs.readFileSync("prisma/seed-data/original-assessment-banks.json", "utf8"));
  const retained = JSON.parse(fs.readFileSync("prisma/seed-data/generated_ccat_similar_questions.json", "utf8"));
  const rows = [...originals, ...retained.map((q: any) => ({ bank: "CCAT", number: q.number, content: { ...q, text: q.text.replace(/\s*\(Set\s*\d+,?\s*item\s*\d+\)/gi, "").trim() } }))];
  if (new Set(rows.map((q) => `${q.bank}:${q.number}`)).size !== rows.length) throw new Error("Duplicate bank identifiers.");
  for (const q of rows) {
    if (!q.content.text || !Array.isArray(q.content.options) || !Number.isInteger(q.content.correctAnswerIndex) || q.content.correctAnswerIndex < 0 || q.content.correctAnswerIndex >= q.content.options.length) throw new Error(`Invalid question ${q.bank}:${q.number}`);
    for (const image of [q.content.imageUrl, ...(q.content.optionImages || [])]) if (image?.startsWith("/") && !fs.existsSync(path.join("public", image))) throw new Error(`Missing image ${image}`);
  }
  const old = await prisma.question.findMany({ where: { bank: { in: ["CCAT", "MTT"] } } });
  console.log({ current: old.length, proposed: rows.length, preservedImages: originals.filter((q: any) => q.bank === "CCAT").length });
  if (!process.argv.includes("--apply")) return;
  const backup = `prisma/question-bank-before-restore-${Date.now()}.json`;
  fs.writeFileSync(backup, JSON.stringify(old));
  await prisma.$transaction(async (tx) => {
    // Freeze any previously started test against its original bank before replacement.
    const attempts = await tx.assessmentAttempt.findMany({ where: { type: { in: ["CCAT", "MTT"] }, status: "ACTIVE", questionSnapshot: null } });
    for (const attempt of attempts) await tx.assessmentAttempt.update({ where: { id: attempt.id }, data: { questionSnapshot: j(selectAttemptQuestions(old.filter((q) => q.bank === attempt.type), attempt.id, attempt.type)) } });
    for (const bank of ["CCAT", "MTT"]) {
      const desired = rows.filter((q) => q.bank === bank);
      await tx.question.deleteMany({ where: { bank, number: { notIn: desired.map((q) => q.number) } } });
      for (const q of desired) await tx.question.upsert({ where: { bank_number: { bank, number: q.number } }, update: { content: j(q.content) }, create: { bank, number: q.number, content: j(q.content) } });
    }
  }, { timeout: 60000 });
  console.log({ restored: rows.length, backup });
}
main().finally(() => prisma.$disconnect());
