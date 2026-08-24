import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../../lib/db";

const PW = "password123";
let appId: string;

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
}

// Isolates an MTT-released state for candidate1 so the scrolling bug can be
// reproduced/verified deterministically, then restores the seeded state.
test.beforeAll(async () => {
  const cand = await prisma.user.findUnique({ where: { email: "candidate1@portal.com" } });
  if (!cand) throw new Error("Seed missing candidate1@portal.com");
  const app = await prisma.application.findFirst({ where: { candidateId: cand.id } });
  if (!app) throw new Error("Seed missing candidate1 application");
  appId = app.id;
  await prisma.assessmentResult.deleteMany({ where: { applicationId: appId, type: "MTT" } });
  await prisma.assessmentAttempt.deleteMany({ where: { applicationId: appId, type: "MTT" } });
  await prisma.application.update({
    where: { id: appId },
    data: { currentStage: "MTT", phaseReleased: true },
  });
});

test.afterAll(async () => {
  if (appId) {
    await prisma.assessmentResult.deleteMany({ where: { applicationId: appId, type: "MTT" } });
    await prisma.assessmentAttempt.deleteMany({ where: { applicationId: appId, type: "MTT" } });
    await prisma.application.update({
      where: { id: appId },
      data: { currentStage: "CCAT", phaseReleased: false },
    });
  }
  await prisma.$disconnect();
});

test("MTT answer input rejects mouse-wheel value changes and preserves entered value", async ({ page }) => {
  await page.addInitScript(() => {
    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(Element.prototype, "requestFullscreen", {
      configurable: true,
      value: async function requestFullscreen() {
        fullscreenElement = this;
        document.dispatchEvent(new Event("fullscreenchange"));
      },
    });
  });
  await login(page, "candidate1@portal.com");
  await page.goto(`/candidate/test/${appId}/MTT`);

  // Start the assessment if a fresh attempt is required.
  const startBtn = page.getByRole("button", { name: /Start/i });
  if (await startBtn.count()) await startBtn.first().click();

  const fullscreenBtn = page.getByRole("button", { name: /Enter fullscreen/i });
  if (await fullscreenBtn.isVisible()) {
    await fullscreenBtn.click();
    await expect(page.getByRole("dialog", { name: /Continue in fullscreen/i })).toBeHidden();
  }

  const input = page.locator('input[name^="a"]').first();
  await expect(input).toBeVisible();
  // Regression guard: the control must NOT be a native number input, whose
  // wheel behavior silently changes the value while scrolling the page.
  await expect(input).toHaveAttribute("type", "text");
  await expect(input).toHaveAttribute("inputmode", "numeric");

  await input.fill("50");
  await expect(input).toHaveValue("50");

  // Scroll up and down repeatedly over the focused input.
  await input.focus();
  await input.evaluate((el) => {
    for (let i = 0; i < 20; i++) {
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true }));
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
    }
  });

  // The entered value must be untouched by scrolling.
  await expect(input).toHaveValue("50");

});

test("recruiter candidates list expands the workspace inline (no navigation)", async ({ page }) => {
  await login(page, "recruiter@portal.com");
  await page.goto("/recruiter/candidates");
  await expect(page).toHaveURL(/\/recruiter\/candidates/);

  // Candidate name is a button that expands inline (no <a> navigation).
  const row = page.getByRole("button", { name: /Carol Candidate/i }).first();
  await expect(row).toBeVisible();
  await row.click();

  // Profile section appears inline.
  await expect(page.getByText(/Candidate Profile/i)).toBeVisible();
  // Still on the same URL (no /recruiter/candidates/[id] navigation).
  await expect(page).toHaveURL(/\/recruiter\/candidates$/);

  // Click a stage chip to swap inline evidence.
  await page.getByRole("button", { name: /CCAT/i }).first().click();
  await expect(page.getByText(/CCAT \/ IQ — Details/i)).toBeVisible();
});
