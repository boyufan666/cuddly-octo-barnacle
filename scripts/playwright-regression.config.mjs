import { defineConfig, devices } from "@playwright/test";
import { resolvePlaywrightRegressionEnvironment } from "./playwright-regression-environment.mjs";
import { collectPlaywrightProviderEnvironment } from "./run-playwright-regression.mjs";

const input = resolvePlaywrightRegressionEnvironment();
const { apiPort, webPort } = input;
const webHost = "127.0.0.1";
const apiHost = "127.0.0.1";
const webBaseUrl = `http://${webHost}:${webPort}`;
const apiBaseUrl = `http://${apiHost}:${apiPort}`;
const providerEnvironment = collectPlaywrightProviderEnvironment();
const businessTestMatch =
  /(?:web-playwright-regression|formal-ui-business-chain)\.spec\.mjs/;

export default defineConfig({
  testDir: ".",
  testMatch: businessTestMatch,
  timeout: 60_000,
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"]],
  outputDir: "../output/playwright/test-results",
  use: {
    baseURL: webBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @rehab-platform/api exec node dist/main.js",
      url: `${apiBaseUrl}/health/live`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: input.databaseUrl,
        JWT_SECRET: input.jwtSecret,
        COOKIE_SECURE: input.cookieSecure,
        PUBLIC_CREDENTIAL_THROTTLE_LIMIT: input.throttleLimit,
        PUBLIC_CREDENTIAL_THROTTLE_TTL_MS: input.throttleTtlMs,
        SENSITIVE_DATA_KEY_REF: input.sensitiveDataKeyRef,
        SENSITIVE_DATA_KEY: input.sensitiveDataKey,
        PORT: String(apiPort),
        WEB_ORIGIN: webBaseUrl,
        PLAYWRIGHT_CONFIRM_DISPOSABLE: "YES",
        ...providerEnvironment,
      },
    },
    {
      command: `pnpm --filter @rehab-platform/web start --hostname ${webHost} --port ${webPort}`,
      url: webBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
        PLAYWRIGHT_WEB_PORT: String(webPort),
        PLAYWRIGHT_API_PORT: String(apiPort),
      },
    },
  ],
  projects: [
    {
      name: "account-setup",
      testMatch: /playwright-account-setup\.spec\.mjs/,
    },
    {
      name: "chromium-1280",
      dependencies: ["account-setup"],
      testMatch: businessTestMatch,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "chromium-1366",
      dependencies: ["account-setup"],
      testMatch: businessTestMatch,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: "chromium-1440",
      dependencies: ["account-setup"],
      testMatch: businessTestMatch,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chromium-pixel",
      dependencies: ["account-setup"],
      testMatch: businessTestMatch,
      use: {
        ...devices["Pixel 7"],
      },
    },
    {
      name: "chromium-iphone",
      dependencies: ["account-setup"],
      testMatch: businessTestMatch,
      use: {
        ...devices["iPhone 14"],
        browserName: "chromium",
      },
    },
  ],
});
