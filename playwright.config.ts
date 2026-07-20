import { defineConfig, devices } from '@playwright/test';

/**
 * ChordPath is a static single-file app. Tests serve it with http-server and drive it
 * through the app's global functions (checkAnswer, genExercise, etc.) plus DOM assertions.
 *
 * Set PLAYWRIGHT_CHROMIUM_PATH to use a preinstalled Chromium instead of a downloaded one
 * (useful in sandboxes/CI where the browser version is pinned by the environment).
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions },
    },
    {
      // Dedicated HiDPI project to verify device-pixel-ratio canvas scaling.
      name: 'chromium-hidpi',
      testMatch: /canvas-rendering\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 2, launchOptions },
    },
  ],
  webServer: {
    command: 'npm run serve',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
