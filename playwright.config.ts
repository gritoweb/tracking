import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  // Was pinned to 1 for `pnpm dev`'s HMR crash; 4 flaked under this machine's concurrent load, 2 held clean.
  workers: 2,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // NODE_ENV=development keeps auth.ts's disableSignUp compiled out; CI=true skips vite.config.ts's remote AI binding, which no e2e test needs.
    command: "pnpm run build && vite preview --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NODE_ENV: "development", CI: "true" },
  },
});
