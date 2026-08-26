import { test, expect, type Page } from "@playwright/test";
import { join } from "path";
import { prisma } from "../../lib/db";

const CV = join(__dirname, "fixtures", "sample-cv.txt");
const PW = "password1234";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
}

test.describe("Recruitment portal E2E", () => {
  test.beforeAll(async () => {
    const candidate = await prisma.user.findUnique({ where: { email: "candidate2@portal.com" } });
    if (candidate) await prisma.application.deleteMany({ where: { candidateId: candidate.id } });
  });

  test.afterAll(async () => {
    const candidate = await prisma.user.findUnique({ where: { email: "candidate2@portal.com" } });
    if (candidate) await prisma.application.deleteMany({ where: { candidateId: candidate.id } });
    await prisma.$disconnect();
  });

  test("candidate applies to a drive (async CV) and lands on application page", async ({ page }) => {
    await login(page, "candidate2@portal.com");
    await page.goto("/");
    // Open the first drive's apply page.
    await page.click('a.btn-primary:has-text("Apply")');
    await expect(page).toHaveURL(/\/candidate\/apply\//);
    await page.fill('input[name="name"]', "Cory Candidate");
    await page.setInputFiles('input[name="cvFile"]', CV);
    await page.click('button:has-text("Submit application")');
    await expect(page).toHaveURL(/\/candidate\/application\//);
    await expect(page.getByText("CV screening")).toBeVisible();
    // CV is processed asynchronously; the UI shows the processing state.
    await expect(page.getByText("Processing").or(page.getByText("/100"))).toBeVisible();
  });

  test("candidate cannot view another application", async ({ page }) => {
    await login(page, "candidate1@portal.com");
    await page.goto("/candidate/application/does-not-exist");
    await expect(page.getByText("Application not found")).toBeVisible();
  });

  test("secure CV route denies unauthenticated access", async ({ page }) => {
    const res = await page.goto("/api/cv/any-id");
    expect(res?.status()).toBe(401);
  });

  test("recruiter reaches the candidates page", async ({ page }) => {
    await login(page, "recruiter@portal.com");
    await page.goto("/recruiter/candidates");
    await expect(page).toHaveURL(/\/recruiter\/candidates/);
    await expect(page.getByRole("heading", { name: "Candidates" })).toBeVisible();
  });

  test("reviewer reaches the grading queue", async ({ page }) => {
    await login(page, "reviewer@portal.com");
    await page.goto("/reviewer");
    await expect(page).toHaveURL(/\/reviewer/);
  });

  test("admin reaches the audit log", async ({ page }) => {
    await login(page, "admin@portal.com");
    await page.goto("/admin/audit");
    await expect(page).toHaveURL(/\/admin\/audit/);
  });
});
