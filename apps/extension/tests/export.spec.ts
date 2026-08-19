import { test, expect, simulateDrop } from './fixtures';

test.describe('Export functionality', () => {
  test('Copy exports markdown to clipboard', async ({ context, sidepanelPage }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Add content via direct Milkdown insert (bypassing drop for reliable testing)
    await sidepanelPage.evaluate(() => {
      // Type directly into the editor
      const editor = document.querySelector('.ProseMirror') as HTMLElement;
      editor.focus();
      // Use document.execCommand to insert text (works in Prosemirror)
      document.execCommand('insertText', false, 'Content to export');
    });

    await sidepanelPage.waitForTimeout(500);

    // Click Copy
    const copyBtn = sidepanelPage.locator('button:has-text("Copy")');
    await expect(copyBtn).toBeEnabled({ timeout: 5000 });
    await copyBtn.click();

    // Verify clipboard content
    const clipboardText = await sidepanelPage.evaluate(() =>
      navigator.clipboard.readText(),
    );

    expect(clipboardText).toContain('Content to export');
  });

  test('Clear button resets the editor', async ({ sidepanelPage }) => {
    // Insert content
    await sidepanelPage.evaluate(() => {
      const editor = document.querySelector('.ProseMirror') as HTMLElement;
      editor.focus();
      document.execCommand('insertText', false, 'Content to clear');
    });

    await sidepanelPage.waitForTimeout(500);

    // Verify content is there
    const editor = sidepanelPage.locator('.ProseMirror');
    await expect(editor).toContainText('Content to clear');

    // Click Clear
    const clearBtn = sidepanelPage.locator('button[title="Clear"]');
    await expect(clearBtn).toBeEnabled({ timeout: 5000 });
    await clearBtn.click();

    // Editor should be empty
    await sidepanelPage.waitForTimeout(500);
    const text = await editor.textContent();
    expect(text?.trim()).toBe('');

    // Copy button should be disabled again
    await expect(sidepanelPage.locator('button:has-text("Copy")')).toBeDisabled();
  });

  test('Copy is disabled when editor is empty', async ({ sidepanelPage }) => {
    const copyBtn = sidepanelPage.locator('button:has-text("Copy")');
    await expect(copyBtn).toBeDisabled();
  });
});
