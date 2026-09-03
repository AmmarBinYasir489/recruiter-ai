import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

for (const role of ["recruiter", "admin"]) test(`${role}: stable track summary and scoped onsite comparison`, async ({ page }, info) => {
  test.setTimeout(120000);
  const db = new PrismaClient();
  const driveId = `qa-summary-${randomUUID()}`;
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  try {
    const owner = await db.user.findUniqueOrThrow({ where: { email: "recruiter@portal.com" } });
    const person = await db.user.findUniqueOrThrow({ where: { email: "candidate1@portal.com" } });
    await db.drive.create({ data: { id: driveId, ownerId: owner.id, name: "QA track summary", location: "Remote", jobDescription: "Python", deadline: new Date(Date.now() + 86400000), publicLink: "qa", status: "OPEN", tciWeights: "{}", rubricConfig: "{}", thresholdHistory: "[]" } });
    const first = await db.funnel.create({ data: { driveId, name: "Engineering", published: true, stages: JSON.stringify(["CV_SCREENING", "CCAT", "MTT"].map((type, order) => ({ id: type, type, name: type, order, enabled: true }))) } });
    const second = await db.funnel.create({ data: { driveId, name: "Research", published: true, stages: JSON.stringify(["CV_SCREENING", "PROMPT"].map((type, order) => ({ id: type, type, name: type, order, enabled: true }))) } });
    const base = { candidateId: person.id, driveId, cvScore: 80, cvResult: "HOLD", status: "HOLD", scores: '{"CV_SCREENING":80}' };
    const online = await db.application.create({ data: { ...base, funnelId: first.id, trackKey: `FUNNEL:${first.id}`, currentStage: "CCAT", results: { create: [{ type: "CCAT", mode: "ONLINE", normalized: 60, status: "PASS" }, { type: "CCAT", mode: "ONSITE", normalized: 0, status: "PENDING" }] } } });
    const onsite = await db.application.create({ data: { ...base, funnelId: first.id, trackKey: `ONSITE:${first.id}`, currentStage: "CCAT" } });
    await db.application.create({ data: { ...base, funnelId: second.id, trackKey: `FUNNEL:${second.id}`, currentStage: "PROMPT" } });
    await page.goto("/login");
    await page.getByLabel("Email").fill(`${role}@portal.com`);
    await page.getByLabel("Password", { exact: true }).fill("password1234");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${role}$`));
    await page.goto(`/${role}/candidates?driveId=${driveId}`);
    await page.getByRole("button", { name: person.name!, exact: true }).first().click();
    const summary = page.getByRole("region", { name: "Selected track summary" });
    const tracks = page.getByLabel("Candidate funnel tracks");
    await expect(summary).toContainText("Engineering");
    await expect(summary).toContainText("Online");
    await expect(page.getByRole("button", { name: "CCAT 60% Passed", exact: true })).toBeVisible();
    await page.getByText("Online / onsite comparison · Engineering", { exact: true }).click();
    const comparison = page.getByRole("region", { name: "Same-funnel score comparison" });
    await expect(comparison.getByRole("row")).toHaveCount(4);
    await expect(comparison.getByRole("row", { name: /Onsite retests on online track/ })).toContainText("2 / 3");
    await expect(comparison.getByRole("row", { name: /Full onsite session/ })).toContainText("1 / 3");
    await tracks.getByRole("button", { name: /Engineering · Onsite/ }).click();
    await expect(summary).toContainText("Onsite");
    await expect(summary).toContainText("1 / 3");
    await expect(page.getByRole("button", { name: "CCAT — Pending", exact: true })).toBeVisible();
    if (await page.locator("details").filter({ hasText: "Online / onsite comparison · Engineering" }).getAttribute("open") === null) {
      await page.getByText("Online / onsite comparison · Engineering", { exact: true }).click();
    }
    const selected = comparison.getByRole("row", { name: /Full onsite session/ });
    await expect(selected).toContainText("Selected track");
    const api = await page.request.get(`/api/recruiter/candidates/${onsite.id}`);
    expect(api.ok()).toBe(true);
    const { view } = await api.json();
    expect(view.trackComparison.filter((row: any) => row.selected)[0].total).toBe(view.application.overallScore);
    for (const width of [390, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await summary.scrollIntoViewIfNeeded();
      const bounds = await summary.boundingBox();
      const controls = await page.getByLabel("Funnel assignment controls").boundingBox();
      expect(bounds).not.toBeNull();
      expect(controls!.y).toBeGreaterThanOrEqual(bounds!.y + bounds!.height);
      expect(await summary.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await summary.screenshot({ path: info.outputPath(`summary-${width}.png`) });
    }
    await tracks.getByRole("button", { name: /Research · PROMPT/ }).click();
    await expect(summary).toContainText("Research");
    await expect(summary).toContainText("1 / 2");
    await page.getByText("Online / onsite comparison · Research", { exact: true }).click();
    await expect(comparison.getByRole("row")).toHaveCount(2);
    await expect(comparison).toContainText("No onsite session or retest is recorded");
    await tracks.getByRole("button", { name: "Engineering · CCAT", exact: true }).click();
    await expect(summary).toContainText("Engineering");
    await page.getByText("Online / onsite comparison · Engineering", { exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: info.outputPath("track-workspace.png"), fullPage: true });
    expect(browserErrors).toEqual([]);
  } finally {
    await db.application.deleteMany({ where: { driveId } });
    await db.funnel.deleteMany({ where: { driveId } });
    await db.drive.deleteMany({ where: { id: driveId } });
    await db.$disconnect();
  }
});
