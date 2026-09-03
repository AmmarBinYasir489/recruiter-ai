import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

test("public link → signup → CV-only apply; closed intake preserves existing dashboard", async ({ page }, info) => {
  if (!process.env.DATABASE_URL?.includes("/test-results/public-launch/qa.db")) throw new Error("Isolated QA database required");
  const db = new PrismaClient();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  let candidateId: string | undefined;
  const email = `public-qa-${Date.now()}@example.com`;
  const drive = await db.drive.create({ data: {
    name: "Public signup QA", location: "Remote", jobDescription: "Required: Python, SQL. Backend projects preferred.",
    deadline: new Date(Date.now() + 86400000), publicLink: "", status: "OPEN",
    cvPassThreshold: 60, tciWeights: "{}", rubricConfig: "{}", thresholdHistory: "[]",
    ownerId: (await db.user.findUniqueOrThrow({ where: { email: "recruiter@portal.com" } })).id,
  } });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/apply/${drive.id}`);
    await expect(page.getByRole("heading", { name: drive.name })).toBeVisible();
    await page.getByRole("link", { name: /create.*account|sign up/i }).click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Disposable-test-1234");
    expect(await page.locator('form input:not([type="hidden"])').count()).toBe(2);
    await page.screenshot({ path: info.outputPath("signup-mobile.png"), fullPage: true });
    await page.getByRole("button", { name: "Create candidate account" }).click();
    await expect(page).toHaveURL(new RegExp(`/candidate/apply/${drive.id}$`), { timeout: 15000 });
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    candidateId = user.id;
    expect(user.role).toBe("candidate");
    await page.getByLabel("Upload your CV").setInputFiles({ name: "resume.txt", mimeType: "text/plain", buffer: Buffer.from("Alex Applicant\nalex@example.test\nPython engineer.\nProjects\nBuilt Python API with SQL database.\nEducation\nComputer Science graduate.") });
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page).toHaveURL(/\/candidate\/application\//);
    const application = await db.application.findFirstOrThrow({ where: { candidateId: user.id, driveId: drive.id } });
    expect(application.funnelId).toBeNull();
    expect(application.phaseReleased).toBe(false);
    expect(application.cvScore).toBeNull();
    expect(await db.cvJob.count({ where: { applicationId: application.id, status: "QUEUED" } })).toBe(1);
    await expect(page.getByText(/scoring breakdown|choose application path|funnel tracks/i)).toHaveCount(0);
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: info.outputPath("application-mobile.png"), fullPage: true });
    await db.drive.update({ where: { id: drive.id }, data: { status: "CLOSED", deadline: new Date(Date.now() - 1000) } });
    await page.goto(`/apply/${drive.id}`);
    await expect(page).toHaveURL(/\/candidate$/);
    expect(await db.application.count({ where: { candidateId: user.id, driveId: drive.id } })).toBe(1);
    await page.context().clearCookies();
    await page.goto(`/login?returnTo=${encodeURIComponent(`/apply/${drive.id}`)}`);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Wrong-test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("The email or password is incorrect.")).toBeVisible();
    await page.getByLabel("Password", { exact: true }).fill("Disposable-test-1234");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/candidate$/);
    await page.context().clearCookies();
    await page.goto(`/apply/${drive.id}`);
    await expect(page.getByText(/applications.*closed/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /create.*account|sign up/i })).toHaveCount(0);
    const api = await page.request.get("/api/recruiter/candidates");
    expect(api.status()).toBe(401);
    expect(errors).toEqual([]);
  } finally {
    candidateId ||= (await db.user.findUnique({ where: { email }, select: { id: true } }))?.id;
    await db.application.deleteMany({ where: { driveId: drive.id } });
    await db.drive.delete({ where: { id: drive.id } });
    if (candidateId) {
      const candidate = await db.user.findUnique({ where: { id: candidateId } });
      if (candidate?.authId) {
        const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
        const removed = await admin.auth.admin.deleteUser(candidate.authId);
        if (removed.error) throw new Error(`Test identity cleanup required: ${candidate.authId}`);
      }
      await db.auditLog.deleteMany({ where: { actorId: candidateId } });
      await db.user.delete({ where: { id: candidateId } });
    }
    await db.$disconnect();
  }
});
