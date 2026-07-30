import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./src/tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "./test-results",
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // WebGL needs a real GPU path; SwiftShader covers it headlessly.
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } },
    },
  ],

  // Setting BASE_URL points the suite at an already-running instance (e.g. the
  // deployed site) instead of spinning up a throwaway one.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        // Serves the exported `out/` under production's nginx try_files rules.
        // Not `next start`: that refuses to run against `output: "export"`, and
        // it would route through Next rather than off disk, hiding exactly the
        // kind of missing-file break that took the inner pages down.
        command: "node scripts/serve-static.mjs out 3100",
        url: "http://127.0.0.1:3100/",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
