const { defineConfig, devices } = require("@playwright/test");

const SKIP_WEB_TESTS =
  process.env.SKIP_WEB_TESTS === "true"
    ? true
    : process.env.SKIP_WEB_TESTS === "false"
      ? false
      : true; // default skip unless explicitly enabled
const E2E_HOST = process.env.E2E_HOST || "127.0.0.1";
const E2E_PORT = Number(process.env.E2E_PORT || process.env.PORT || 4173);
const baseURL = `http://${E2E_HOST}:${E2E_PORT}`;

const config = SKIP_WEB_TESTS
  ? defineConfig({
      testDir: "./e2e",
      testIgnore: "**/*",
      projects: [],
    })
  : defineConfig({
      testDir: "./e2e",
      fullyParallel: false,
      retries: process.env.CI ? 2 : 0,
      workers: process.env.CI ? 1 : undefined,
      timeout: 30_000,
      expect: {
        timeout: 7_500,
      },
      use: {
        baseURL,
        trace: "retain-on-failure",
      },
      projects: [
        {
          name: "chromium",
          use: { ...devices["Desktop Chrome"] },
        },
      ],
      webServer: {
        command: `PORT=${E2E_PORT} HOST=${E2E_HOST} npm --prefix ./backend run start`,
        url: `${baseURL}/health`,
        reuseExistingServer: process.env.E2E_REUSE === "false" ? false : true,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 90_000,
      },
    });

module.exports = config;
