import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, '.output/chrome-mv3');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 30_000,

  projects: [
    {
      name: 'chrome-extension',
      use: {
        // Playwright requires persistent context for extensions.
        // The launchOptions args are handled in fixtures.ts via chromium.launchPersistentContext.
        // This config provides the path for fixtures to reference.
        headless: false,
        viewport: { width: 1280, height: 720 },
        _extensionPath: extensionPath,
      } as any,
    },
  ],
});
