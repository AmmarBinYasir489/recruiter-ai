import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

test("observe whether an open staff workspace receives a candidate submission", async ({ page }, info) => {
  test.setTimeout(60000);
  const db = new PrismaClient();
  const driveId = `qa-live-${randomUUID()}`;
  let appId = "";
  try {
    const owner = await db.user.findUniqueOrThrow({ where: { email: "recruiter@portal.com" } });
    const person = await db.user.findUniqueOrThrow({ where: { email: "candidate1@portal.com" } });
    await db.drive.create({ data: { id: driveId, ownerId: owner.id, name: "QA live update", location: "Remote", jobDescription: "Python", deadline: new Date(Date.now() + 86400000), status: "OPEN", publicLink: "qa", tciWeights: "{}", rubricConfig: "{}", thresholdHistory: "[]" } });
    const funnel = await db.funnel.create({ data: { driveId, name: "QA live", published: true, stages: JSON.stringify(["CV_SCREENING", "CCAT", "MTT"].map((type, order) => ({ id: type, type, name: type, order, enabled: true }))) } });
    const app = await db.application.create({ data: { candidateId: person.id, driveId, funnelId: funnel.id, cvScore: 70, cvResult: "PASS", status: "IN_PROGRESS", currentStage: "CCAT", phaseReleased: true, scores: '{"CV_SCREENING":70}' } });
    appId = app.id;
    await page.goto("/login");
    await page.getByLabel("Email").fill("recruiter@portal.com");
    await page.getByLabel("Password", { exact: true }).fill("password1234");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/recruiter$/);
    await page.goto(`/recruiter/candidates?driveId=${driveId}`);
    await page.getByPlaceholder("name / email / phone / app id").fill(person.email);
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(page).toHaveURL(/search=candidate1/);
    await page.getByRole("checkbox", { name: "Select all", exact: true }).check();
    await expect(page.getByRole("button", { name: "Reissue current online test", exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: "Select all", exact: true }).uncheck();
    const csvUrl = await page.getByRole("link", { name: "Export CSV", exact: true }).getAttribute("href");
    const csv = await page.request.get(csvUrl!);
    expect(csv.ok()).toBe(true);
    expect(await csv.text()).toContain('"funnelName","scoreMode","trackCount","totalScore","gradedCount","assessmentCount","scoreState"');
    // Isolate live polling from the separate post-filter interaction failure.
    await page.goto(`/recruiter/candidates?driveId=${driveId}&open=${app.id}`);
    await expect(page.getByRole("button", { name: "CCAT — Active", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "CCAT — Active", exact: true }).click();
    await page.getByLabel("Internal note", { exact: true }).fill("Unsaved note survives refresh");
    await db.assessmentResult.create({ data: { applicationId: app.id, type: "CCAT", normalized: 65, status: "PENDING", gradedAt: new Date() } });
    await db.application.update({ where: { id: app.id }, data: { scores: '{"CV_SCREENING":70,"CCAT":65}', status: "HOLD", phaseReleased: false } });
    const refreshed = await expect(page.getByRole("button", { name: "CCAT 65% Pending", exact: true })).toBeVisible({ timeout: 15000 }).then(() => true, () => false);
    expect(refreshed).toBe(true);
    await expect(page.getByLabel("Internal note", { exact: true })).toHaveValue("Unsaved note survives refresh");
    const response = await page.request.get(`/api/recruiter/candidates/${app.id}`);
    const { view } = await response.json();
    const observation = { filterApplied: true, csvStatus: csv.status(), csvContentType: csv.headers()["content-type"], uiRefreshedWithin15Seconds: refreshed, serverScore: view.application.scores.CCAT, refreshPaused: await page.locator('[data-auto-refresh-pause="true"]').count() > 0 };
    console.log("UX_LIVE_AUDIT", JSON.stringify(observation));
    await info.attach("live-update-audit", { body: JSON.stringify(observation, null, 2), contentType: "application/json" });
    await page.screenshot({ path: info.outputPath("open-workspace-after-submission.png"), fullPage: true });
  } finally {
    if (appId) {
      await db.notification.deleteMany({ where: { relatedAppId: appId } });
      await db.auditLog.deleteMany({ where: { meta: { contains: appId } } });
    }
    await db.application.deleteMany({ where: { driveId } });
    await db.funnel.deleteMany({ where: { driveId } });
    await db.drive.deleteMany({ where: { id: driveId } });
    await db.$disconnect();
  }
});
