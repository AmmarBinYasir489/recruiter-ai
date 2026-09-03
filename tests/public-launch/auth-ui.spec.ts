import { test, expect } from "@playwright/test";

// Read-only UI regression: no identity creation, login or database mutation.
for (const width of [320, 390, 768, 1440]) {
  test(`auth roles and responsive layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/login?returnTo=%2Fapply%2Ftest-drive");
    await page.getByLabel("Email", { exact: true }).fill("preview@example.test");
    await page.getByLabel("Password", { exact: true }).fill("preview-password");
    await page.getByRole("button", { name: "Show password", exact: true }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password", exact: true }).click();
    for (const role of ["Recruiter", "Reviewer", "Admin", "Candidate"]) {
      await page.getByRole("radio", { name: role, exact: true }).check();
      await expect(page.getByRole("heading", { name: `${role} sign in`, exact: true })).toBeVisible();
      await expect(page.getByLabel("Email", { exact: true })).toHaveValue("preview@example.test");
    }
    await page.getByRole("radio", { name: "Candidate", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Recruiter", exact: true })).toBeChecked();
    await page.getByRole("radio", { name: "Candidate", exact: true }).check();
    await page.getByRole("link", { name: "Create an account" }).click();
    for (const role of ["Recruiter", "Reviewer", "Admin"]) {
      await page.getByRole("radio", { name: role, exact: true }).check();
      await expect(page.locator("form")).toHaveCount(0);
      await expect(page.getByRole("link", { name: `Continue to ${role.toLowerCase()} sign in` })).toHaveAttribute("href", new RegExp(`portal=${role.toLowerCase()}`));
    }
    await page.getByRole("radio", { name: "Candidate", exact: true }).check();
    await expect(page.locator('form input:not([type="hidden"])')).toHaveCount(2);
    await expect(page.locator('input[name="returnTo"]')).toHaveValue("/apply/test-drive");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
