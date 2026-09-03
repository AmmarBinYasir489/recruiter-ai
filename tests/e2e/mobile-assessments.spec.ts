import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

test("phone questions and games fit, Enter does not submit, unsupported fullscreen does not start timer", async ({ page }, info) => {
  test.setTimeout(120000);
  const db = new PrismaClient();
  const driveId = `qa-mobile-${randomUUID()}`;
  const appIds: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    const owner = await db.user.findUniqueOrThrow({ where: { email: "recruiter@portal.com" } });
    const candidate = await db.user.findUniqueOrThrow({ where: { email: "candidate1@portal.com" } });
    await db.drive.create({ data: { id: driveId, ownerId: owner.id, name: "QA mobile", location: "Remote", jobDescription: "Testing", status: "OPEN", deadline: new Date(Date.now() + 86400000), publicLink: "qa", tciWeights: "{}", rubricConfig: "{}", thresholdHistory: "[]" } });
    const funnel = await db.funnel.create({ data: { driveId, name: "Private mobile QA", published: true, stages: JSON.stringify(["CV_SCREENING", "CCAT", "MTT", "GAMES", "ESSAY"].map((type, order) => ({ id: type, type, name: type, enabled: true, order, durationMin: 20 }))) } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await page.getByLabel("Email").fill(candidate.email);
    await page.getByLabel("Password", { exact: true }).fill("password1234");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/candidate$/, { timeout: 20000 });
    for (const type of ["CCAT", "MTT", "GAMES", "ESSAY"]) {
      const app = await db.application.create({ data: { candidateId: candidate.id, driveId, funnelId: funnel.id, trackKey: `QA:${type}`, currentStage: type, status: "IN_PROGRESS", phaseReleased: true, cvScore: 60, cvResult: "HOLD", scores: '{"CV_SCREENING":60}' } });
      appIds.push(app.id);
      await page.goto(`/candidate/test/${app.id}/${type}`);
      if (type === "ESSAY") {
        await page.evaluate(() => Object.defineProperty(document, "fullscreenEnabled", { value: false, configurable: true }));
        await page.getByRole("button", { name: "Start assessment", exact: true }).click();
        await expect(page.getByText(/This browser cannot run/)).toBeVisible();
        expect(await db.assessmentAttempt.count({ where: { applicationId: app.id, status: "ACTIVE" } })).toBe(0);
        continue;
      }
      await page.getByRole("button", { name: "Start assessment", exact: true }).click();
      await expect(page.getByRole("button", { name: "Enter fullscreen", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Enter fullscreen", exact: true }).click();
      if (type === "GAMES") {
        await page.getByLabel("Sudoku row 1, column 3", { exact: true }).fill("4");
        await page.getByLabel("Sudoku row 1, column 3", { exact: true }).press("Enter");
        await expect(page).toHaveURL(new RegExp(`/test/${app.id}/GAMES$`));
        expect(await db.assessmentResult.count({ where: { applicationId: app.id } })).toBe(0);
      } else {
        await expect(page.getByText(type === "CCAT" ? "Question 1 of 80" : "Question 1 of 30", { exact: true })).toBeVisible();
        await page.locator("fieldset:visible").getByRole("radio").first().check();
        await page.getByRole("button", { name: "Next question", exact: true }).click();
        await expect(page.getByText(type === "CCAT" ? "Question 2 of 80" : "Question 2 of 30", { exact: true })).toBeVisible();
      }
      for (const width of [320, 390]) {
        await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
        await page.setViewportSize({ width, height: 844 });
        await page.getByRole("button", { name: "Enter fullscreen", exact: true }).click();
        await expect(page.getByRole("navigation", { name: "Candidate navigation" })).toHaveCount(0);
        await expect(page.getByRole("timer")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const board = type === "GAMES" ? page.getByRole("grid", { name: "Word search board" }) : page.locator("fieldset:visible");
        const box = await board.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        await page.screenshot({ path: info.outputPath(`${type}-${width}.png`), fullPage: true });
      }
      await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
    }
    expect(errors).toEqual([]);
  } finally {
    await db.notification.deleteMany({ where: { relatedAppId: { in: appIds } } });
    for (const id of appIds) await db.auditLog.deleteMany({ where: { meta: { contains: id } } });
    await db.application.deleteMany({ where: { driveId } });
    await db.funnel.deleteMany({ where: { driveId } });
    await db.drive.deleteMany({ where: { id: driveId } });
    await db.$disconnect();
  }
});
