import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.LOGIN_TEST_BASE_URL || "http://localhost:3000";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto(`${baseUrl}/login`);
  await page.fill("#email", email);
  await page.fill("#password", "password1234");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(email.startsWith("recruiter") ? /\/recruiter$/ : /\/candidate$/);
}

test("recruiter sees one candidate row and switches funnel tracks inline", async ({ page }) => {
  await signIn(page, "recruiter@portal.com");
  await page.goto(`${baseUrl}/recruiter/candidates`);

  const candidateRows = page.locator("tbody > tr").filter({ hasText: "candidate1@portal.com" });
  await expect(candidateRows).toHaveCount(1);
  await candidateRows.getByRole("button", { name: "Carol Candidate" }).click();

  await expect(page.getByText("2 separate tracks:")).toBeVisible();
  const secondTrack = page.getByRole("button", { name: /New Funnel · MTT/i });
  await secondTrack.click();
  await expect(secondTrack).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(/\/recruiter\/candidates(?:\?.*)?$/);
  await expect(page.getByPlaceholder("name / email / phone / app id")).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
});

test("legacy MTT bank opens without a server runtime error", async ({ page }) => {
  const prisma = new PrismaClient();
  const application = await prisma.application.findFirst({
    where: { candidate: { email: "candidate1@portal.com" }, currentStage: "MTT" },
    select: { id: true },
  });
  await prisma.$disconnect();
  test.skip(!application, "No active candidate1 MTT track in the local QA database.");

  await signIn(page, "candidate1@portal.com");
  await page.goto(`${baseUrl}/candidate/test/${application!.id}/MTT`);

  await expect(page.getByRole("heading", { name: "Math Thinking Test" })).toBeVisible();
  await expect(page.getByText(/Question 1 of 30/i)).toBeVisible();
  await expect(page.getByText(/MTT question bank incomplete/i)).toHaveCount(0);
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
});
