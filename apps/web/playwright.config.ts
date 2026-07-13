import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @nexos/api dev",
      cwd: "../..",
      url: "http://localhost:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        PORT: "3001",
        REDIS_URL: "redis://localhost:6379",
        RATE_LIMIT_KEY_SECRET: "playwright-rate-limit-key-secret-at-least-32-chars",
        REDIS_KEY_PREFIX: `nexos:e2e:${process.pid}`,
        CORS_ORIGINS: "http://localhost:3000",
      },
    },
    {
      command: "pnpm --filter @nexos/web dev",
      cwd: "../..",
      url: "http://localhost:3000/login",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_SOCKET_URL: "http://localhost:3001",
      },
    },
  ],
});
