import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test("candidate dashboard, application and notifications fit a phone viewport", async ({ page }, info) => {
  test.setTimeout(60000);
  const db = new PrismaClient();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    const candidate = await db.user.findUniqueOrThrow({ where: { email: "candidate1@portal.com" } });
    const application = await db.application.findFirst({ where: { candidateId: candidate.id, status: { not: "ARCHIVED" } }, orderBy: { createdAt: "desc" } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await page.getByLabel("Email").fill(candidate.email);
    await page.getByLabel("Password", { exact: true }).fill("password1234");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/candidate$/, { timeout: 20000 });
    const routes = ["/candidate", "/candidate/notifications", ...(application ? [`/candidate/application/${application.id}`] : [])];
    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await page.locator("button, a, input, select, textarea").evaluateAll(nodes => nodes.filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
      }).length)).toBe(0);
      await page.screenshot({ path: info.outputPath(route.replaceAll("/", "-").slice(1) + ".png"), fullPage: true });
    }
    expect(errors).toEqual([]);
  } finally { await db.$disconnect(); }
});
