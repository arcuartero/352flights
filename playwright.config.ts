import { defineConfig } from "@playwright/test";

const MOCK_PORT = 54329;
const APP_PORT = 3100;
const mock = `http://127.0.0.1:${MOCK_PORT}`;

// Every external service points at e2e/mock-backend.mjs. Keys are set (even empty) so the
// developer's .env, which Next would otherwise load, can never reach real Supabase or Resend.
const appEnv: Record<string, string> = {
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_TSCONFIG_PATH: "e2e/tsconfig.json",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SITE_URL: `http://localhost:${APP_PORT}`,
  SUPABASE_URL: mock,
  SUPABASE_SERVICE_ROLE_KEY: "e2e-service-role",
  RESEND_API_KEY: "e2e-resend",
  RESEND_API_BASE_URL: mock,
  RESEND_REPLY_TO_EMAIL: "",
  RESEND_FROM_EMAIL: "",
  OPS_BASIC_AUTH_USER: "e2e-ops",
  OPS_BASIC_AUTH_PASSWORD: "e2e-ops-password",
  CRON_SECRET: "e2e-cron",
  UNSPLASH_ACCESS_KEY: "",
  NEXT_PUBLIC_GA4_MEASUREMENT_ID: "",
  GA4_PROPERTY_ID: "",
  CREATELLO_CONTENT_INBOX_URL: "",
  VPS_SCANNER_AGENT_URL: "",
  VERCEL_OIDC_TOKEN: "",
};

export default defineConfig({
  testDir: "e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    // Uses the installed Google Chrome; no browser download needed locally or on GitHub runners.
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/mock-backend.mjs",
      url: `${mock}/__emails`,
      env: { E2E_MOCK_PORT: String(MOCK_PORT) },
      reuseExistingServer: false,
    },
    {
      command: `npx next dev -p ${APP_PORT}`,
      // Waiting on the home page makes Next compile it before the first test starts.
      url: `http://localhost:${APP_PORT}/`,
      env: appEnv,
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
