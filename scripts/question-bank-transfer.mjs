import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match || process.env[match[1]]) continue;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  process.env[match[1]] = value;
}

const prisma = new PrismaClient();
const backupPath = ".supabase-question-bank-backup.json";
const mode = process.argv[2];

function mttImage(year, ref) {
  if (!ref || !String(ref).startsWith("Image_")) return null;
  return `/mtt/${year}/${String(ref).replace("Image_", "").trim()}.png`;
}

try {
  if (mode === "--export") {
    const [ccat, mtt, coding, essay, prompt] = await Promise.all([
      prisma.$queryRawUnsafe(`select * from public."Question" order by "number"`),
      prisma.$queryRawUnsafe(`
        select distinct on ("questionNumber") *
        from public."MttQuestion"
        order by "questionNumber", "year" desc
      `),
      prisma.$queryRawUnsafe(`select * from public."CodingQuestion" order by "number"`),
      prisma.$queryRawUnsafe(`select * from public."EssayQuestion" order by "section", "number"`),
      prisma.$queryRawUnsafe(`select * from public."PromptEngineeringQuestion" order by "number"`),
    ]);
    writeFileSync(backupPath, JSON.stringify({ exportedAt: new Date().toISOString(), ccat, mtt, coding, essay, prompt }, null, 2));
    console.log(JSON.stringify({ ok: true, mode: "export", counts: { ccat: ccat.length, mtt: mtt.length, coding: coding.length, essay: essay.length, prompt: prompt.length } }));
  } else if (mode === "--import") {
    const data = JSON.parse(readFileSync(backupPath, "utf8"));
    const rows = [];
    for (const q of data.ccat) {
      rows.push({ bank: "CCAT", number: q.number, content: {
        text: q.text, type: q.type, imageUrl: q.imageUrl, localImagePath: q.localImagePath,
        options: q.options, correctAnswer: q.correctAnswer, correctAnswerIndex: q.correctAnswerIndex,
        difficulty: q.difficulty, category: q.category, points: q.points,
      } });
    }
    for (const q of data.mtt) {
      const labels = ["A", "B", "C", "D", "E"];
      const options = labels.map((label) => q.options?.[label] ?? "");
      rows.push({ bank: "MTT", number: q.questionNumber, content: {
        text: q.text, year: q.year, imageUrl: mttImage(q.year, q.imageRef), options,
        optionImages: options.map((value) => mttImage(q.year, value)),
        correctAnswer: q.correctAnswer, correctAnswerIndex: labels.indexOf(q.correctAnswer), points: q.points,
      } });
    }
    for (const q of data.coding) rows.push({ bank: "CODING", number: q.number, content: { title: q.title, prompt: q.prompt, example: q.example, approach: q.approach, solutionPython: q.solutionPython, complexity: q.complexity } });
    for (const [index, q] of data.essay.entries()) rows.push({ bank: "ESSAY", number: index + 1, content: { section: q.section, originalNumber: q.number, prompt: q.prompt, minWords: q.minWords } });
    for (const q of data.prompt) rows.push({ bank: "PROMPT", number: q.number, content: { title: q.title, prompt: q.prompt, maxScore: q.maxScore } });

    const banks = ["CCAT", "MTT", "CODING", "ESSAY", "PROMPT"];
    await prisma.$transaction([
      prisma.question.deleteMany({ where: { bank: { in: banks } } }),
      prisma.question.createMany({
        data: rows.map((row) => ({ bank: row.bank, number: row.number, content: JSON.stringify(row.content) })),
      }),
    ]);
    console.log(JSON.stringify({ ok: true, mode: "import", total: rows.length }));
  } else {
    throw new Error("Use --export before the wipe or --import after the new schema is deployed.");
  }
} finally {
  await prisma.$disconnect();
}
