import { defineConfig, devices } from "@playwright/test";

// E2E smoke suite. Requires a built app and a seeded SQLite DB:
//   npm run build && npx prisma db push && npx tsx prisma/seed.ts
//   npx playwright install chromium   # one-time browser download
//   npx playwright test
// Uses the demo accounts (password: password123) created by the seed.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
