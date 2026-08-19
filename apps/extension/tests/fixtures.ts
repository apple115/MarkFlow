import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../.output/chrome-mv3');

/**
 * Simulate a drop event on the Prosemirror editor.
 */
async function simulateDrop(
  page: Page,
  data: { type: 'text/plain' | 'text/html' | 'text/uri-list'; value: string },
): Promise<void> {
  await page.evaluate((dropData) => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) throw new Error('Prosemirror editor not found');

    const dt = new DataTransfer();
    dt.setData(dropData.type, dropData.value);

    const event = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt,
    });

    editor.dispatchEvent(event);
  }, data);
}

/**
 * Simulate a multi-type drop (e.g. both text/plain and text/html).
 */
async function simulateMultiDrop(
  page: Page,
  entries: Array<{ type: string; value: string }>,
): Promise<void> {
  await page.evaluate((dropEntries) => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) throw new Error('Prosemirror editor not found');

    const dt = new DataTransfer();
    for (const entry of dropEntries) {
      dt.setData(entry.type, entry.value);
    }

    const event = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt,
    });

    editor.dispatchEvent(event);
  }, entries);
}

/**
 * Get the extension ID by waiting for the extension's service worker or
 * any extension page to appear in the browser context.
 */
async function waitForExtensionId(context: BrowserContext, timeout = 15_000): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    // Check service workers
    for (const sw of context.serviceWorkers()) {
      const url = sw.url();
      if (url.startsWith('chrome-extension://')) {
        return new URL(url).hostname;
      }
    }

    // Check all pages
    for (const page of context.pages()) {
      const url = page.url();
      if (url.startsWith('chrome-extension://')) {
        return new URL(url).hostname;
      }
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  const swUrls = context.serviceWorkers().map((w) => w.url());
  const pageUrls = context.pages().map((p) => p.url());
  throw new Error(
    `Extension ID not found within ${timeout}ms.\n` +
    `Service workers: ${swUrls.join(', ') || 'none'}\n` +
    `Pages: ${pageUrls.join(', ')}`,
  );
}

/**
 * Custom Playwright test fixtures for MarkFlow extension testing.
 */
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  sidepanelPage: Page;
}>({
  context: async ({}, use) => {
    const userDataDir = path.resolve(__dirname, '../.test-user-data');

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=TranslateUI',
      ],
    });

    // Wait for extension to initialize
    await context.pages()[0].waitForLoadState('domcontentloaded').catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));

    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    const id = await waitForExtensionId(context);
    await use(id);
  },

  sidepanelPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Wait for the React root to render
    await page.waitForSelector('#root', { timeout: 10_000 });

    // Wait for Milkdown to initialize
    await page.waitForSelector('.ProseMirror', { timeout: 15_000 });
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
export { simulateDrop, simulateMultiDrop };
