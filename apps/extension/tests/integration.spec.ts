import { test, expect } from './fixtures';

test.describe('Full integration flow', () => {
  test('insert content → copy → verify markdown in clipboard → clear', async ({
    context,
    sidepanelPage,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Step 1: Verify empty state
    const copyBtn = sidepanelPage.locator('button:has-text("Copy")');
    await expect(copyBtn).toBeDisabled();

    // Step 2: Insert content via typing (simulating user input)
    await sidepanelPage.evaluate(() => {
      const editor = document.querySelector('.ProseMirror') as HTMLElement;
      editor.focus();
      document.execCommand('insertText', false, 'First fragment from a blog post');
    });

    await sidepanelPage.waitForTimeout(500);

    // Step 3: Insert more content
    await sidepanelPage.evaluate(() => {
      const editor = document.querySelector('.ProseMirror') as HTMLElement;
      editor.focus();
      // Move to end
      const sel = window.getSelection();
      sel?.selectAllChildren(editor);
      sel?.collapseToEnd();
      document.execCommand('insertText', false, '\nSecond fragment with more context');
    });

    await sidepanelPage.waitForTimeout(500);

    // Step 4: Copy to clipboard
    await expect(copyBtn).toBeEnabled({ timeout: 5000 });
    await copyBtn.click();

    // Step 5: Verify clipboard content
    const clipboardText = await sidepanelPage.evaluate(() =>
      navigator.clipboard.readText(),
    );

    expect(clipboardText).toContain('First fragment from a blog post');
    expect(clipboardText).toContain('Second fragment with more context');

    // Step 6: Clear the editor
    const clearBtn = sidepanelPage.locator('button[title="Clear"]');
    await clearBtn.click();

    // Editor is empty
    await sidepanelPage.waitForTimeout(500);
    const editorText = await sidepanelPage.locator('.ProseMirror').textContent();
    expect(editorText?.trim()).toBe('');
    await expect(copyBtn).toBeDisabled();
  });

  test('editor accepts typed content and exports correctly', async ({
    context,
    sidepanelPage,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Type markdown-style content
    await sidepanelPage.evaluate(() => {
      const editor = document.querySelector('.ProseMirror') as HTMLElement;
      editor.focus();
      document.execCommand('insertText', false, '# Test Heading\n\nSome body text');
    });

    await sidepanelPage.waitForTimeout(500);

    // Copy
    await sidepanelPage.locator('button:has-text("Copy")').click();

    const clipboardText = await sidepanelPage.evaluate(() =>
      navigator.clipboard.readText(),
    );

    // Markdown should contain the heading and text
    expect(clipboardText).toContain('Test Heading');
    expect(clipboardText).toContain('Some body text');
  });
});
