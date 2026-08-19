import { test, expect, simulateDrop, simulateMultiDrop } from './fixtures';

test.describe('Text drop handling', () => {
  test('plain text becomes a blockquote', async ({ sidepanelPage }) => {
    await simulateDrop(sidepanelPage, {
      type: 'text/plain',
      value: 'This is dragged text from a webpage',
    });

    // Wait for async processing + Prosemirror render
    await sidepanelPage.waitForTimeout(1000);

    const editor = sidepanelPage.locator('.ProseMirror');
    // The text should appear somewhere in the editor (blockquote or paragraph)
    await expect(editor).toContainText('This is dragged text from a webpage');
  });

  test('HTML content is handled', async ({ sidepanelPage }) => {
    await simulateDrop(sidepanelPage, {
      type: 'text/html',
      value: '<p>This is <strong>bold</strong> text from a webpage</p>',
    });

    await sidepanelPage.waitForTimeout(1000);

    const editor = sidepanelPage.locator('.ProseMirror');
    await expect(editor).toContainText(/text from a webpage/);
  });

  test('multi-type drop works', async ({ sidepanelPage }) => {
    await simulateMultiDrop(sidepanelPage, [
      { type: 'text/plain', value: 'Plain text content' },
      { type: 'text/html', value: '<p>Plain text content</p>' },
    ]);

    await sidepanelPage.waitForTimeout(1000);

    const editor = sidepanelPage.locator('.ProseMirror');
    await expect(editor).toContainText('Plain text content');
  });

  test('status dot turns green after content is added', async ({ sidepanelPage }) => {
    const dot = sidepanelPage.locator('header span.w-2');
    // Initially gray
    await expect(dot).toHaveClass(/bg-gray/);

    await simulateDrop(sidepanelPage, {
      type: 'text/plain',
      value: 'Some content',
    });

    // Wait for React state to update (char count polls every 500ms)
    await sidepanelPage.waitForTimeout(1200);

    await expect(dot).toHaveClass(/bg-green-500/);
  });

  test('char count updates after drop', async ({ sidepanelPage }) => {
    await simulateDrop(sidepanelPage, {
      type: 'text/plain',
      value: 'Hello world',
    });

    // Wait for char count to update (500ms polling interval)
    await sidepanelPage.waitForTimeout(1200);

    const footer = sidepanelPage.locator('footer');
    // Should no longer show "0 chars"
    const text = await footer.textContent();
    expect(text).not.toContain('0 chars');
    expect(text).toMatch(/\d+ chars/);
  });
});
