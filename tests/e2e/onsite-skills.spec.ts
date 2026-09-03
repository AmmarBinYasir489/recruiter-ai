import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

async function login(page: Page, role: "recruiter" | "candidate") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(role === "candidate" ? "candidate1@portal.com" : "recruiter@portal.com");
  await page.getByLabel("Password", { exact: true }).fill("password1234");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${role}$`));
}

test("drive skills stay editable and do not overwrite recruiter edits", async ({ page }, info) => {
  await login(page, "recruiter");
  await page.goto("/recruiter/drives/new");
  await page.getByLabel("Required skills", { exact: true }).fill("React, JavaScript");
  await page.getByLabel("Preferred skills", { exact: true }).fill("TypeScript");
  await page.getByLabel("Title", { exact: true }).fill("Web Developer");
  await page.getByLabel("Location", { exact: true }).click();
  await expect(page.getByLabel("Required skills", { exact: true })).toHaveValue("React, JavaScript");
  await expect(page.getByRole("button", { name: "Suggest skills from job title" })).toBeEnabled();
  await page.getByLabel("Preferred skills", { exact: true }).fill("");
  await expect(page.getByLabel("Preferred skills", { exact: true })).toHaveValue("");
  await page.screenshot({ path: info.outputPath("drive-skills.png"), fullPage: true });
});

test("title triggers an AI draft or an honest provider error", async ({ page }) => {
  test.setTimeout(45000);
  await login(page, "recruiter");
  await page.goto("/recruiter/drives/new");
  await page.getByLabel("Title", { exact: true }).fill("Web Developer");
  await page.getByLabel("Location", { exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /AI draft ready|unavailable|Unable to request|no usable skills/ })).toBeVisible({ timeout: 30000 });
  const status = await page.getByRole("status").filter({ hasText: /AI draft ready|unavailable|Unable to request|no usable skills/ }).innerText();
  console.log(`Skill suggestion UI: ${status}`);
  if (status.includes("AI draft ready")) await expect(page.getByLabel("Required skills", { exact: true })).not.toHaveValue("");
  await expect(page.getByLabel("Required skills", { exact: true })).toBeEditable();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
});

test("bulk onsite requires a funnel and candidate sees a separate onsite session", async ({ page }, info) => {
  const db = new PrismaClient();
  const driveId = `qa-onsite-${randomUUID()}`;
  let created = false;
  try {
    const owner = await db.user.findUniqueOrThrow({ where: { email: "recruiter@portal.com" } });
    const candidate = await db.user.findUniqueOrThrow({ where: { email: "candidate1@portal.com" } });
    await db.drive.create({ data: { id: driveId, ownerId: owner.id, name: "QA onsite flow", location: "Remote", jobDescription: "React web development", status: "OPEN", deadline: new Date(Date.now() + 86400000), publicLink: "qa", tciWeights: "{}", rubricConfig: "{}", thresholdHistory: "[]" } });
    created = true;
    const funnel = await db.funnel.create({ data: { driveId, name: "QA complete session", published: true, stages: JSON.stringify(["CV_SCREENING", "CCAT", "MTT", "CODING", "FINAL"].map((type, order) => ({ id: type, type, name: type, order, enabled: true, passScore: 55, durationMin: 20 }))) } });
    const original = await db.application.create({ data: { driveId, candidateId: candidate.id, funnelId: funnel.id, currentStage: "FINAL", cvResult: "PASS", cvScore: 70, status: "HOLD", scores: '{"CCAT":88}' } });
    await login(page, "recruiter");
    await page.goto(`/recruiter/candidates?driveId=${driveId}`);
    await page.getByLabel("Select all", { exact: true }).check();
    await page.getByLabel("Bulk test delivery mode").selectOption("ONSITE");
    await expect(page.getByLabel("Bulk assessment type")).toHaveCount(0);
    const issue = page.getByRole("button", { name: "Assign onsite funnel", exact: true });
    await expect(issue).toBeDisabled();
    await page.getByLabel("Funnel for selected applicants").selectOption(funnel.id);
    await expect(issue).toBeEnabled();
    await page.screenshot({ path: info.outputPath("onsite-bulk.png"), fullPage: true });
    await issue.click();
    await expect(page.getByRole("dialog")).toContainText("onsite funnel session");
    const onsite = await db.application.findFirstOrThrow({ where: { driveId, trackKey: `ONSITE:${funnel.id}` } });
    expect(await db.application.findUnique({ where: { id: original.id } })).toMatchObject({ scores: original.scores, currentStage: "FINAL" });
    // Synthetic notification history only; all removed with this temporary drive.
    await db.notification.createMany({ data: Array.from({ length: 6 }, (_, n) => ({ userId: candidate.id, relatedAppId: onsite.id, type: "QA", message: `QA onsite update ${n}` })) });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
    await login(page, "candidate");
    await page.goto(`/candidate/application/${onsite.id}`);
    await expect(page.getByText("QA complete session", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Onsite · CCAT / IQ" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View notification history" })).toBeVisible();
    expect(await page.getByText(/^QA onsite update/).count()).toBeLessThanOrEqual(3);
    await page.screenshot({ path: info.outputPath("onsite-candidate.png"), fullPage: true });
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  } finally {
    if (created) {
      const apps = await db.application.findMany({ where: { driveId }, select: { id: true } });
      const ids = apps.map((app) => app.id);
      await db.notification.deleteMany({ where: { relatedAppId: { in: ids } } });
      await db.auditLog.deleteMany({ where: { meta: { contains: driveId } } });
      for (const id of ids) await db.auditLog.deleteMany({ where: { meta: { contains: id } } });
      await db.application.deleteMany({ where: { driveId } });
      await db.funnel.deleteMany({ where: { driveId } });
      await db.drive.delete({ where: { id: driveId } });
    }
    await db.$disconnect();
  }
});
