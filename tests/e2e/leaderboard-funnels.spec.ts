import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.LOGIN_TEST_BASE_URL || "http://localhost:3000";

async function signInAsAdmin(page: import("@playwright/test").Page) {
  await page.goto(`${baseUrl}/login`);
  await page.fill("#email", "admin@portal.com");
  await page.fill("#password", "password1234");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/admin$/);
}

test("admin leaderboard ranks one funnel track at a time and opens the exact track", async ({ page }) => {
  const prisma = new PrismaClient();
  const candidate = await prisma.user.findUnique({
    where: { email: "candidate1@portal.com" },
    include: {
      applications: {
        where: { funnelId: { not: null }, status: { not: "ARCHIVED" } },
        include: { funnel: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  await prisma.$disconnect();
  test.skip(!candidate || candidate.applications.length < 2, "Two active candidate funnel tracks are required for this QA check.");

  const [first, second] = candidate!.applications;
  await signInAsAdmin(page);
  await page.goto(`${baseUrl}/admin/drives/${first.driveId}/scores?funnelId=${first.funnelId}`);

  await expect(page.getByLabel("Assessment funnel")).toHaveValue(first.funnelId!);
  await expect(page.locator("tbody tr").filter({ hasText: "candidate1@portal.com" })).toHaveCount(1);
  await expect(page.getByText(`${first.funnel!.name} · ${first.id.slice(0, 8).toUpperCase()}`)).toBeVisible();

  await page.getByLabel("Assessment funnel").selectOption(second.funnelId!);
  await page.getByRole("button", { name: "View leaderboard" }).click();
  await expect(page).toHaveURL(new RegExp(`funnelId=${second.funnelId}`));
  await expect(page.locator("tbody tr").filter({ hasText: "candidate1@portal.com" })).toHaveCount(1);
  await expect(page.getByText(`${second.funnel!.name} · ${second.id.slice(0, 8).toUpperCase()}`)).toBeVisible();

  await page.getByRole("link", { name: candidate!.name }).click();
  await expect(page).toHaveURL(/\/admin\/candidates\?search=/);
  await expect(page.getByText(new RegExp(`ID:\\s*${second.id}`)).first()).toBeVisible();
});
