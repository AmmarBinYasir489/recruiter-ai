import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

async function login(page: Page, role: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(role === "candidate" ? "candidate1@portal.com" : "recruiter@portal.com");
  await page.getByLabel("Password", { exact: true }).fill("password1234");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${role}$`));
}

test("CV approval, mixed CCAT, Hold, threshold approval and candidate privacy", async ({ browser }, info) => {
  test.setTimeout(180000);
  const db = new PrismaClient();
  const driveId = `qa-approval-${randomUUID()}`;
  const staffContext = await browser.newContext();
  const candidateContext = await browser.newContext();
  const staff = await staffContext.newPage();
  const candidatePage = await candidateContext.newPage();
  let appId = "";
  try {
    const owner = await db.user.findUniqueOrThrow({ where: { email: "recruiter@portal.com" } });
    const candidate = await db.user.findUniqueOrThrow({ where: { email: "candidate1@portal.com" } });
    await db.drive.create({ data: { id: driveId, ownerId: owner.id, name: "QA Approval Drive", location: "Remote", jobDescription: "Python", deadline: new Date(Date.now() + 86400000), publicLink: "qa", status: "OPEN", tciWeights: "{}", rubricConfig: "{}", thresholdHistory: "[]" } });
    const funnel = await db.funnel.create({ data: { driveId, name: "PRIVATE FUNNEL NAME", published: true, stages: JSON.stringify(["CV_SCREENING", "CCAT", "MTT", "FINAL"].map((type, order) => ({ id: type, type, name: type, order, enabled: true, passScore: 60, durationMin: 20 }))) } });
    const app = await db.application.create({ data: { driveId, candidateId: candidate.id, funnelId: funnel.id, currentStage: "CV_SCREENING", cvScore: 72, cvResult: "HOLD", status: "HOLD", phaseReleased: false, scores: '{"CV_SCREENING":72}' } });
    appId = app.id;
    await login(staff, "recruiter");
    await staff.goto(`/recruiter/funnel/${funnel.id}`);
    const cv = staff.locator(".card").filter({ has: staff.getByLabel("Select all CV Screening candidates") }).first();
    await cv.getByLabel("Select all CV Screening candidates").check();
    await cv.getByRole("button", { name: "Pass selected", exact: true }).click();
    await expect(staff.getByRole("dialog")).toContainText("Passed");
    await expect.poll(async () => (await db.application.findUniqueOrThrow({ where: { id: app.id } })).currentStage).toBe("CCAT");
    await login(candidatePage, "candidate");
    await candidatePage.goto(`/candidate/application/${app.id}`);
    await expect(candidatePage.getByText("PRIVATE FUNNEL NAME")).toHaveCount(0);
    await expect(candidatePage.getByText(/Reference|72\/100|72%|rubric/i)).toHaveCount(0);
    const watermark = await candidatePage.request.get("/api/updates");
    expect((await watermark.json()).watermark).toMatch(/^[a-f0-9]{64}$/);
    await candidatePage.getByRole("link", { name: "Start CCAT / IQ" }).click();
    await candidatePage.getByRole("button", { name: /Start assessment/i }).click();
    await expect(candidatePage.getByText("Question 1 of 80", { exact: true })).toBeVisible();
    await candidatePage.getByRole("button", { name: "Enter fullscreen", exact: true }).click();
    await expect(candidatePage.getByText(/\(Set \d+, item/)).toHaveCount(0);
    const attempt = await db.assessmentAttempt.findFirstOrThrow({ where: { applicationId: app.id, status: "ACTIVE" } });
    const questions = JSON.parse(attempt.questionSnapshot!);
    expect(questions).toHaveLength(80);
    expect(new Set(questions.map((q: any) => JSON.parse(q.content).category)).size).toBe(4);
    expect(questions.some((q: any) => JSON.parse(q.content).imageUrl)).toBe(true);
    for (let i = 0; i < 80; i++) {
      await candidatePage.locator("fieldset:visible").getByRole("radio").first().check();
      if (i < 79) await candidatePage.getByRole("button", { name: "Next question", exact: true }).click();
    }
    await candidatePage.getByRole("button", { name: "Submit CCAT", exact: true }).click();
    await expect(candidatePage).toHaveURL(new RegExp(`/candidate/application/${app.id}$`));
    await expect(candidatePage.getByText("Your submission is under review. No action is needed from you.")).toBeVisible();
    expect(await db.application.findUniqueOrThrow({ where: { id: app.id } })).toMatchObject({ currentStage: "CCAT", status: "HOLD", phaseReleased: false });
    await candidatePage.screenshot({ path: info.outputPath("candidate-held.png"), fullPage: true });
    await staff.goto(`/recruiter/funnel/${funnel.id}`);
    const ccat = staff.locator(".card").filter({ has: staff.getByLabel("Select all CCAT / IQ candidates") }).first();
    await ccat.getByLabel("New pass threshold").fill("0");
    await ccat.getByRole("button", { name: "Preview impact", exact: true }).click();
    await expect(ccat.getByText("Threshold change preview (read-only)")).toBeVisible();
    await ccat.getByRole("button", { name: "Confirm & Apply", exact: true }).click();
    await expect.poll(async () => (await db.application.findUniqueOrThrow({ where: { id: app.id } })).currentStage).toBe("MTT");
    await candidatePage.reload();
    await expect(candidatePage.getByRole("link", { name: "Start Math thinking" })).toBeVisible();
    await staff.goto(`/recruiter/candidates?driveId=${driveId}`);
    await expect(staff.getByRole("columnheader", { name: "Total /100" })).toBeVisible();
    await expect(staff.getByText(/2\/3 graded/)).toBeVisible();
    await staff.screenshot({ path: info.outputPath("staff-provisional-total.png"), fullPage: true });
    for (const page of [staff, candidatePage]) await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  } finally {
    if (appId) {
      await db.notification.deleteMany({ where: { relatedAppId: appId } });
      await db.auditLog.deleteMany({ where: { OR: [{ meta: { contains: appId } }, { meta: { contains: driveId } }] } });
    }
    await db.thresholdChange.deleteMany({ where: { driveId } });
    await db.application.deleteMany({ where: { driveId } });
    await db.funnel.deleteMany({ where: { driveId } });
    await db.drive.deleteMany({ where: { id: driveId } });
    await db.$disconnect();
    await staffContext.close();
    await candidateContext.close();
  }
});
