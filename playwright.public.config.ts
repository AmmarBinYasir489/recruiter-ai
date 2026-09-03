import { defineConfig, devices } from "@playwright/test";

// Start the isolated QA server on port 3100 first; never reuse the real portal.
export default defineConfig({
  testDir: "./tests/public-launch",
  timeout: 60000, workers: 1, retries: 0,
  outputDir: "test-results/public-launch/browser",
  use: { baseURL: "http://localhost:3100", headless: true, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
