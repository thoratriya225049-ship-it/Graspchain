import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against the full local stack (chain, API, web, verifier). `pnpm dev` starts it; when it is
 * not already running, Playwright starts it via the same orchestrator.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } }, dependencies: ["setup"], testIgnore: /auth\.setup\.ts/ },
  ],
  webServer: {
    command: "pnpm --dir ../.. dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
