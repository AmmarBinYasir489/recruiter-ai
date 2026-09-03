import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TIER1, TIER2, TIER3, TIER_SCORE } from "../lib/engine/tiers";
import { j } from "../lib/db";
import { computeCvScore, cvComponents } from "../lib/engine/cv";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const SEED_DIR = path.join(process.cwd(), "prisma", "seed-data");

function uid() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL || process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Demo seeding is disabled. Use ALLOW_DEMO_SEED=true only against a disposable local database. Never seed production accounts or drives.");
  }
  console.log("Seeding clean recruitment-portal...");

  // ---- Users ----
  const seedPassword = process.env.PORTAL_SEED_PASSWORD || "password1234";
  if (seedPassword.length < 12) throw new Error("Set PORTAL_SEED_PASSWORD to at least 12 characters before production seeding.");
  const pw = await bcrypt.hash(seedPassword, 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@portal.com" },
    update: {},
    create: { email: "admin@portal.com", name: "Ada Admin", passwordHash: pw, role: "admin" },
  });
  const recruiter = await prisma.user.upsert({
    where: { email: "recruiter@portal.com" },
    update: {},
    create: { email: "recruiter@portal.com", name: "Ravi Recruiter", passwordHash: pw, role: "recruiter" },
  });
  const reviewer = await prisma.user.upsert({
    where: { email: "reviewer@portal.com" },
    update: {},
    create: { email: "reviewer@portal.com", name: "Rita Reviewer", passwordHash: pw, role: "reviewer" },
  });
  const c1 = await prisma.user.upsert({
    where: { email: "candidate1@portal.com" },
    update: {},
    create: { email: "candidate1@portal.com", name: "Carol Candidate", passwordHash: pw, role: "candidate" },
  });
  const c2 = await prisma.user.upsert({
    where: { email: "candidate2@portal.com" },
    update: {},
    create: { email: "candidate2@portal.com", name: "Cory Candidate", passwordHash: pw, role: "candidate" },
  });

  // ---- University tiers ----
  const tierRows = [
    ...TIER1.map((n) => ({ name: n, tier: 1, score: TIER_SCORE[1] })),
    ...TIER2.map((n) => ({ name: n, tier: 2, score: TIER_SCORE[2] })),
    ...TIER3.map((n) => ({ name: n, tier: 3, score: TIER_SCORE[3] })),
  ];
  for (const t of tierRows) {
    await prisma.universityTier.upsert({ where: { name: t.name }, update: t, create: t });
  }

  // ---- Question banks ----
  const codingRaw = JSON.parse(fs.readFileSync(path.join(SEED_DIR, "coding_questions.json"), "utf8"));
  for (const q of codingRaw) {
    await prisma.question.upsert({
      where: { bank_number: { bank: "CODING", number: q.number } },
      update: {},
      create: { bank: "CODING", number: q.number, content: j(q) },
    });
  }

  const essayRaw = JSON.parse(fs.readFileSync(path.join(SEED_DIR, "essay_questions.json"), "utf8"));
  for (const q of essayRaw) {
    await prisma.question.upsert({
      where: { bank_number: { bank: "ESSAY", number: q.number } },
      update: {},
      create: { bank: "ESSAY", number: q.number, content: j(q) },
    });
  }

  // Never replace a live bank with the old 80-question demo slice.
  // Restore the complete retained banks explicitly with scripts/restore-assessment-banks.ts.
  const retainedBanks = JSON.parse(fs.readFileSync(path.join(SEED_DIR, "original-assessment-banks.json"), "utf8"));
  const retainedText = JSON.parse(fs.readFileSync(path.join(SEED_DIR, "generated_ccat_similar_questions.json"), "utf8"));
  for (const row of [...retainedBanks, ...retainedText.map((q: any) => ({ bank: "CCAT", number: q.number, content: q }))]) {
    await prisma.question.upsert({ where: { bank_number: { bank: row.bank, number: row.number } }, update: {}, create: { bank: row.bank, number: row.number, content: j(row.content) } });
  }

  // Prompt engineering: 6 prompts
  const prompts = [
    "Rewrite the following instruction to get the best structured output from an LLM.",
    "Design a prompt that makes an LLM act as a senior code reviewer.",
    "Create a prompt that summarizes a long document into 5 bullet points.",
    "Write a prompt that translates casual text into professional email tone.",
    "Design a chain-of-thought prompt for solving a logic puzzle.",
    "Create a prompt that extracts entities (person, org, date) from text.",
  ];
  for (let i = 0; i < prompts.length; i++) {
    await prisma.question.upsert({
      where: { bank_number: { bank: "PROMPT", number: i + 1 } },
      update: {},
      create: { bank: "PROMPT", number: i + 1, content: j({ prompt: prompts[i] }) },
    });
  }

  // ---- Drives ----
  const tciWeights = {
    CV_SCREENING: 10, GAMES: 10, CCAT: 15, MTT: 15, ESSAY: 10, CODING: 25, PROMPT: 15,
  };
  const rubric = {
    cv: { passThresholdNote: "single threshold on drive" },
    ccat: { threshold: 55 },
    mtt: { threshold: 55 },
  };

  const drive1 = await prisma.drive.upsert({
    where: { id: "drive-ai" },
    update: {},
    create: {
      id: "drive-ai",
      name: "AI Engineer — August 2026",
      jobDescription:
        "We are hiring AI Engineers with strong Python, machine learning and LLM experience. Required: Python, PyTorch, NLP. Preferred: LangChain, AWS, Computer Vision.",
      location: "Islamabad, PK",
      deadline: new Date("2026-08-30"),
      publicLink: "/apply/drive-ai",
      status: "OPEN",
      cvPassThreshold: 60,
      tciWeights: j(tciWeights),
      rubricConfig: j(rubric),
      thresholdHistory: j([]),
      ownerId: recruiter.id,
    },
  });

  const drive2 = await prisma.drive.upsert({
    where: { id: "drive-data" },
    update: {},
    create: {
      id: "drive-data",
      name: "Data Scientist — August 2026",
      jobDescription:
        "Data Scientist role. Required: Python, SQL, Data Analysis, Machine Learning. Preferred: Tableau, Deep Learning, AWS.",
      location: "Karachi, PK",
      deadline: new Date("2026-08-28"),
      publicLink: "/apply/drive-data",
      status: "OPEN",
      cvPassThreshold: 65,
      tciWeights: j(tciWeights),
      rubricConfig: j(rubric),
      thresholdHistory: j([]),
      ownerId: recruiter.id,
    },
  });

  // ---- Funnels (published, versioned) ----
  const mkStages = (reviewerId: string) => [
    { id: "st-cv", type: "CV_SCREENING", name: "CV Screening", order: 1, passAction: "NEXT", failAction: "REJECT" },
    { id: "st-ccat", type: "CCAT", name: "CCAT / IQ", order: 2, gradingMode: "AUTO", passScore: 55, durationMin: 15, passAction: "NEXT", failAction: "REJECT" },
    { id: "st-mtt", type: "MTT", name: "Math Thinking Test", order: 3, gradingMode: "AUTO", passScore: 55, durationMin: 20, passAction: "NEXT", failAction: "REJECT" },
    { id: "st-coding", type: "CODING", name: "Coding", order: 4, gradingMode: "MANUAL", passScore: 60, durationMin: 45, assignedReviewers: [reviewerId], passAction: "NEXT", failAction: "HOLD" },
    { id: "st-essay", type: "ESSAY", name: "Essay", order: 5, gradingMode: "MANUAL", assignedReviewers: [reviewerId], passAction: "NEXT", failAction: "HOLD" },
    { id: "st-prompt", type: "PROMPT", name: "Prompt Engineering", order: 6, gradingMode: "MANUAL", assignedReviewers: [reviewerId], passAction: "NEXT", failAction: "HOLD" },
    { id: "st-english", type: "ENGLISH_SPEAKING", name: "English Speaking", order: 7, gradingMode: "MANUAL", passScore: 60, durationMin: 5, assignedReviewers: [reviewerId], passAction: "NEXT", failAction: "HOLD" },
    { id: "st-games", type: "GAMES", name: "Games", order: 8, gradingMode: "AUTO", passAction: "NEXT", failAction: "NEXT" },
    { id: "st-onsite", type: "ONSITE", name: "Onsite", order: 9, passAction: "NEXT", failAction: "REJECT" },
    { id: "st-final", type: "FINAL", name: "Final Decision", order: 10 },
  ];

  if (!(await prisma.funnel.findFirst({ where: { driveId: drive1.id } }))) {
    await prisma.funnel.create({ data: { driveId: drive1.id, version: 1, published: true, stages: j(mkStages(reviewer.id)) } });
  }
  if (!(await prisma.funnel.findFirst({ where: { driveId: drive2.id } }))) {
    await prisma.funnel.create({ data: { driveId: drive2.id, version: 1, published: true, stages: j(mkStages(reviewer.id)) } });
  }

  // ---- Sample application (candidate1 -> drive1) ----
  const drive1Funnel = await prisma.funnel.findFirst({ where: { driveId: drive1.id }, orderBy: { version: "desc" } });
  const existingApp = await prisma.application.findFirst({ where: { candidateId: c1.id, driveId: drive1.id } });
  if (!existingApp) {
    const components = cvComponents({
      cgpa: 3.6,
      university: "LUMS",
      degree: "Computer Science",
      requiredSkills: ["python", "pytorch", "nlp"],
      preferredSkills: ["langchain", "aws", "computer vision"],
      candidateSkills: ["python", "pytorch", "nlp", "machine learning"],
      // Seeded CVs must obey the same evidence rule as uploaded CVs. This
      // fixture contains no extracted project, employment, or other evidence.
      projects: 0,
      experience: 0,
      other: 0,
    });
    const cvScore = computeCvScore(components);
    const parsed = {
      name: "Carol Candidate", email: "candidate1@portal.com", phone: "+92 300 1112222",
      university: "LUMS", degree: "Computer Science", gradYear: 2026, gpa: 3.6, gpaScale: 4,
      skills: ["python", "pytorch", "nlp", "machine learning"],
      matched: ["python", "pytorch", "nlp"], missing: [],
      requiredSkills: ["python", "pytorch", "nlp"],
      preferredSkills: ["langchain", "aws", "computer vision"],
      experience: [], experienceYears: undefined, projects: 0, projectDetails: [],
      certifications: [], coursework: [], links: [],
      summary: "AI Engineer candidate with ML and Python experience.",
      components,
      cvScore,
    };
    const app = await prisma.application.create({
      data: {
        candidateId: c1.id,
        driveId: drive1.id,
        funnelId: drive1Funnel?.id,
        funnelVersion: drive1Funnel?.version ?? 1,
        status: "IN_PROGRESS",
        cvScore,
        cvResult: cvScore >= drive1.cvPassThreshold ? "PASS" : "FAIL",
        extractedCv: j(parsed),
        currentStage: "CCAT",
        stageHistory: j([
          { stage: "CV_SCREENING", status: cvScore >= drive1.cvPassThreshold ? "PASS" : "FAIL", at: new Date().toISOString() },
        ]),
        scores: j({ CV_SCREENING: cvScore }),
        appliedAt: new Date(),
      },
    });
    await prisma.assessmentResult.create({
      data: {
        applicationId: app.id, type: "CCAT", rawScore: 62, maxScore: 80, normalized: 78,
        status: "PASS", answers: j({ correct: 62 }),
      },
    });
    await prisma.notification.create({
      data: { userId: c1.id, type: "STAGE", message: "You passed CV screening. CCAT is now available.", relatedAppId: app.id },
    });
    await prisma.auditLog.create({
      data: { actorId: recruiter.id, action: "APPLICATION_CREATED", meta: j({ applicationId: app.id, driveId: drive1.id }) },
    });
  }

  // AI settings default
  await prisma.aiSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", provider: process.env.AI_PROVIDER || "gemini", model: "", apiKey: "", providerKeys: "{}", providerChecks: "{}" },
  });

  console.log("Seed complete.");
  console.log("Created portal users. Password was loaded from PORTAL_SEED_PASSWORD and was not printed.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
