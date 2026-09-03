import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

async function login(page: Page, role: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${role}@portal.com`);
  await page.getByLabel("Password", { exact: true }).fill("password1234");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${role}$`));
}

for (const role of ["recruiter", "admin"]) test(`${role} navigation, form labels, mobile and empty states audit`, async ({ page }, info) => {
  test.setTimeout(180000);
  await login(page, role);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const routes = ["", "/drives", "/drives/new", "/candidates", ...(role === "admin" ? ["/users", "/tiers", "/audit", "/ai", "/scores"] : [])];
  const observations: any[] = [];
  for (const route of routes) {
    const path = `/${role}${route}`;
    const start = Date.now();
    const response = await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const details = await page.locator("main").evaluate((main) => ({
      unnamedControls: Array.from(main.querySelectorAll<HTMLInputElement>("input:not([type=hidden]),select,textarea")).filter((el) => el.getClientRects().length && !el.labels?.length && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby")).map((el) => ({ name: el.name, type: el.type, placeholder: el.getAttribute("placeholder") })),
      h1Count: main.querySelectorAll("h1").length,
    }));
    const activeNavigation = await page.locator("aside [aria-current=page]").count();
    observations.push({ path, status: response?.status(), navigationMs: Date.now() - start, activeNavigation, ...details });
    expect(response?.status()).toBe(200);
    if (["/candidates", "/users", "/drives/new"].includes(route)) {
      await page.screenshot({ path: info.outputPath(`${role}-${route.slice(1).replaceAll("/", "-")}-desktop.png`), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: info.outputPath(`${role}-${route.slice(1).replaceAll("/", "-")}-mobile.png`), fullPage: true });
      observations.push({ path, mobile: true, overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) });
      await page.setViewportSize({ width: 1280, height: 900 });
    }
  }
  await page.goto(`/${role}/candidates?search=qa-no-match-${randomUUID()}`);
  await expect(page.getByText("No candidates match the filters.", { exact: true })).toBeVisible();
  observations.push({ emptyCandidateState: "visible", clearFiltersControl: await page.getByRole("link", { name: /clear|reset/i }).count() + await page.getByRole("button", { name: /clear|reset/i }).count(), errors });
  console.log("UX_ROUTE_AUDIT", JSON.stringify(observations));
  await info.attach("route-audit", { body: JSON.stringify(observations, null, 2), contentType: "application/json" });
  expect(errors).toEqual([]);
});

test("staff feedback placement, threshold confirmation and note visibility audit", async ({ page }, info) => {
  test.setTimeout(120000);
  const db = new PrismaClient();
  const driveId = `qa-ux-${randomUUID()}`;
  let appId = "";
  const observations: any = {};
  try {
    const owner = await db.user.findUniqueOrThrow({ where: { email: "recruiter@portal.com" } });
    const candidate = await db.user.findUniqueOrThrow({ where: { email: "candidate1@portal.com" } });
    await db.drive.create({ data: { id: driveId, ownerId: owner.id, name: "QA feedback audit", location: "Remote", jobDescription: "Python", status: "OPEN", deadline: new Date(Date.now() + 86400000), publicLink: "qa", tciWeights: "{}", rubricConfig: "{}", thresholdHistory: "[]" } });
    const funnel = await db.funnel.create({ data: { driveId, name: "QA feedback path", published: true, stages: JSON.stringify(["CV_SCREENING", "CCAT", "MTT", "FINAL"].map((type, order) => ({ id: type, type, name: type, order, enabled: true, passScore: 60 }))) } });
    const app = await db.application.create({ data: { candidateId: candidate.id, driveId, funnelId: funnel.id, cvScore: 70, cvResult: "HOLD", currentStage: "CV_SCREENING", status: "HOLD", scores: '{"CV_SCREENING":70}' } });
    appId = app.id;
    await login(page, "recruiter");
    await page.goto(`/recruiter/funnel/${funnel.id}`);
    const cv = page.locator(".card").filter({ has: page.getByLabel("Select all CV Screening candidates") }).first();
    await cv.getByLabel("New pass threshold").fill("75");
    await cv.getByRole("button", { name: "Preview impact", exact: true }).click();
    await cv.getByRole("button", { name: "Confirm & Apply", exact: true }).click();
    await expect.poll(async () => JSON.parse((await db.funnel.findUniqueOrThrow({ where: { id: funnel.id } })).stages)[0].passScore).toBe(75);
    await expect(cv.getByText("Threshold change preview (read-only)")).toHaveCount(0);
    observations.thresholdApplied = { stored: 75, successDialog: await page.getByRole("dialog").count(), successStatus: await cv.getByRole("status").count() };
    await cv.screenshot({ path: info.outputPath("threshold-after-apply.png") });
    await expect(page.getByRole("dialog")).toContainText("Threshold saved: 75%");
    await page.getByRole("dialog").getByRole("button", { name: "Continue" }).click();
    await cv.getByLabel("Select all CV Screening candidates").check();
    await cv.getByRole("button", { name: "Pass selected", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Passed");
    observations.passFeedback = { bounds: await dialog.boundingBox(), focused: await page.evaluate(() => document.activeElement?.textContent?.trim()) };
    await dialog.screenshot({ path: info.outputPath("pass-dialog.png") });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(await db.application.findUniqueOrThrow({ where: { id: appId } })).toMatchObject({ currentStage: "CCAT", phaseReleased: true });
    await page.goto(`/recruiter/candidates?driveId=${driveId}`);
    await page.getByRole("button", { name: candidate.name!, exact: true }).first().click();
    await page.getByRole("button", { name: "CCAT — Active", exact: true }).click();
    const note = page.getByLabel("Internal note", { exact: true });
    await note.fill("QA audit note - temporary");
    await page.getByRole("button", { name: "Save internal note", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Internal note saved");
    await expect.poll(() => db.auditLog.count({ where: { action: "STAFF_NOTE", meta: { contains: appId } } })).toBe(1);
    expect(await db.notification.count({ where: { relatedAppId: appId, message: "QA audit note - temporary", userId: candidate.id } })).toBe(0);
    observations.addNote = { recipient: "staff only", confirmationDialog: await page.getByRole("dialog").count(), inputAfterSend: await note.inputValue() };
    await page.screenshot({ path: info.outputPath("note-after-send.png"), fullPage: true });
    console.log("UX_FEEDBACK_AUDIT", JSON.stringify(observations));
    await info.attach("feedback-audit", { body: JSON.stringify(observations, null, 2), contentType: "application/json" });
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
  }
});

test("admin duplicate-user validation feedback audit without creating a user", async ({ page }, info) => {
  await login(page, "admin");
  await page.goto("/admin/users");
  const form = page.locator("form").filter({ has: page.getByLabel("Name", { exact: true }) });
  await expect(form.getByLabel("Role", { exact: true })).toHaveValue("candidate");
  await form.getByLabel("Name", { exact: true }).fill("QA duplicate test");
  await form.getByLabel("Email", { exact: true }).fill("admin@portal.com");
  await form.locator('input[type="password"]').fill("audit-test-password-123");
  const actionResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/admin/users"));
  await form.locator('button[type="submit"],button:not([type])').click();
  await actionResponse;
  await expect(page.getByText("Email already exists.", { exact: true })).toBeVisible();
  const visibleError = true;
  console.log("UX_USER_VALIDATION", JSON.stringify({ duplicateEmailErrorVisible: visibleError }));
  await page.screenshot({ path: info.outputPath("duplicate-user-response.png"), fullPage: true });
});

test("admin creates a candidate by default and sees the updated list", async ({ page }) => {
  const db = new PrismaClient();
  const email = `qa-create-${randomUUID()}@example.invalid`;
  try {
    await login(page, "admin");
    await page.goto("/admin/users");
    await page.getByLabel("Name", { exact: true }).fill("QA temporary candidate");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Temporary password").fill("qa-test-password-12345");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("User created");
    await page.getByRole("dialog").getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("cell", { name: email, exact: true })).toBeVisible();
    expect((await db.user.findUniqueOrThrow({ where: { email } })).role).toBe("candidate");
  } finally {
    await db.auditLog.deleteMany({ where: { action: "USER_CREATED", meta: { contains: email } } });
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
  }
});
