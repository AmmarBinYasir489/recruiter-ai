import { test, expect } from "@playwright/test";

const baseUrl = process.env.LOGIN_TEST_BASE_URL || "http://localhost:3000";

for (const account of [
  { email: "recruiter@portal.com", destination: /\/recruiter$/ },
  { email: "candidate1@portal.com", destination: /\/candidate$/ },
]) {
  test(`${account.email} receives a session and reaches the correct portal`, async ({ page, context }) => {
    await page.goto(`${baseUrl}/login`);
    await page.fill("#email", account.email);
    await page.fill("#password", "password1234");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(account.destination);
    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name === "rp_session" && cookie.httpOnly)).toBe(true);
  });
}

test("invalid credentials show an accessible error instead of appearing frozen", async ({ page }) => {
  await page.goto(`${baseUrl}/login`);
  await page.fill("#email", "unknown@portal.com");
  await page.fill("#password", "wrong-password");
  await page.click('button[type="submit"]');

  const error = page.locator("#login-error");
  await expect(error).toHaveAttribute("role", "alert");
  await expect(error).toHaveText("The email or password is incorrect.");
  await expect(page.locator("#email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#password")).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/login$/);
});
