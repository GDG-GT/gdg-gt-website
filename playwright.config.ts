import { defineConfig } from "@playwright/test";
const origin = process.env.GDG_BROWSER_ORIGIN || "http://127.0.0.1:4173";
const url = new URL(origin);
const chromium = {
  browserName: "chromium" as const,
  launchOptions: { args: ["--enable-unsafe-swiftshader"] },
};
if (
  url.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.username ||
  url.password ||
  url.pathname !== "/" ||
  url.search ||
  url.hash
)
  throw Error("Browser verification is restricted to a loopback HTTP origin.");
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 7000, toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  outputDir: "artifacts/browser/results",
  reporter: [
    ["list"],
    ["json", { outputFile: "artifacts/browser/results.json" }],
    ["html", { outputFolder: "artifacts/browser/report", open: "never" }],
  ],
  use: {
    baseURL: origin,
    locale: "en-US",
    timezoneId: "America/New_York",
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium-1920",
      use: { ...chromium, viewport: { width: 1920, height: 1080 } },
    },
    {
      name: "chromium-1440",
      use: { ...chromium, viewport: { width: 1440, height: 900 } },
    },
    {
      name: "chromium-mobile",
      use: {
        ...chromium,
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "firefox-1440",
      use: { browserName: "firefox", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "webkit-1440",
      use: { browserName: "webkit", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "webkit-mobile",
      use: {
        browserName: "webkit",
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: process.env.GDG_BROWSER_ORIGIN
    ? undefined
    : {
        command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
        url: origin,
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
});
