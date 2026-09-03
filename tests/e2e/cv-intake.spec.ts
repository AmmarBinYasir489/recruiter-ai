import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("candidate1@portal.com");
  await page.getByLabel("Password", { exact: true }).fill("password1234");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/candidate$/);
}

test("existing applicant returns to dashboard after intake expiry", async ({ page }) => {
  const db = new PrismaClient();
  try {
    const app = await db.application.findFirstOrThrow({
      where: { candidate: { email: "candidate1@portal.com" }, drive: { deadline: { lt: new Date("2026-09-01") } } },
    });
    await signIn(page);
    await page.goto(`/candidate/apply/${app.driveId}`);
    await expect(page).toHaveURL(/\/candidate$/);
    await expect(page.getByText("My applications", { exact: true })).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Continue to dashboard" }).first()).toBeVisible();
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  } finally { await db.$disconnect(); }
});

test("CV-only form and stale submission both obey drive closure", async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  const db = new PrismaClient();
  const id = `qa-cv-intake-${randomUUID()}`;
  let created = false;
  try {
    const owner = await db.user.findUniqueOrThrow({ where: { email: "recruiter@portal.com" } });
    await db.drive.create({ data: {
      id, name: "QA CV-only application", ownerId: owner.id, jobDescription: "Required: Python",
      location: "Remote", deadline: new Date(Date.now() + 86400000 * 2), status: "OPEN", publicLink: `/apply/${id}`,
      tciWeights: "{}", rubricConfig: "{}", thresholdHistory: "[]",
    } });
    created = true;
    await signIn(page);
    // Audit this application's flow separately from the existing login page.
    browserErrors.length = 0;
    await page.goto(`/candidate/apply/${id}`);
    await expect(page.locator('form input:not([type="hidden"])')).toHaveCount(1);
    await expect(page.locator("textarea")).toHaveCount(0);
    await expect(page.getByLabel("Upload your CV")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit application" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("cv-upload-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("cv-upload-mobile.png"), fullPage: true });

    // Only a synthetic local file is selected. Intake validation rejects it
    // before Storage or AI is called, so no external test upload is performed.
    await page.getByLabel("Upload your CV").setInputFiles({ name: "qa-cv.txt", mimeType: "text/plain", buffer: Buffer.from("QA Example\nSkills\nPython\nProjects\nA sample Python project for intake testing.") });
    await db.drive.update({ where: { id }, data: { deadline: new Date("2020-01-01") } });
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.locator("#application-error")).toContainText("deadline has passed");
    expect(await db.application.count({ where: { driveId: id } })).toBe(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Applications closed" })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Go to dashboard" })).toBeVisible();
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
    expect(browserErrors).toEqual([]);
  } finally {
    if (created) await db.drive.delete({ where: { id } });
    await db.$disconnect();
  }
});
