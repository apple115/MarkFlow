import { test, expect } from './fixtures';

test.describe('Sidepanel UI', () => {
  test('renders the editor with empty state', async ({ sidepanelPage }) => {
    // Header is visible
    await expect(sidepanelPage.locator('header')).toBeVisible();

    // MarkFlow logo text
    await expect(sidepanelPage.locator('text=MarkFlow')).toBeVisible();

    // Status dot is gray when empty
    const dot = sidepanelPage.locator('header span.w-2');
    await expect(dot).toHaveClass(/bg-gray-300|bg-gray-600/);

    // Copy button is disabled when empty
    const copyBtn = sidepanelPage.locator('button:has-text("Copy")');
    await expect(copyBtn).toBeDisabled();

    // Clear button is disabled when empty
    const clearBtn = sidepanelPage.locator('button[title="Clear"]');
    await expect(clearBtn).toBeDisabled();
  });

  test('Prosemirror editor is editable', async ({ sidepanelPage }) => {
    const editor = sidepanelPage.locator('.ProseMirror');

    // Editor exists and is editable
    await expect(editor).toBeAttached();
    const contentEditable = await editor.getAttribute('contenteditable');
    expect(contentEditable).toBe('true');
  });

  test('footer shows char count', async ({ sidepanelPage }) => {
    const footer = sidepanelPage.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer.locator('text=0 chars')).toBeVisible();
  });

  test('drag overlay appears when dragging over editor', async ({ sidepanelPage }) => {
    // Simulate a dragenter event with dataTransfer types
    await sidepanelPage.evaluate(() => {
      const editor = document.querySelector('.milkdown-root');
      if (!editor) return;
      const dt = new DataTransfer();
      dt.setData('text/plain', 'test');
      const event = new DragEvent('dragenter', {
        bubbles: true,
        dataTransfer: dt,
      });
      editor.dispatchEvent(event);
    });

    // The overlay should appear
    await expect(sidepanelPage.locator('text=Drop to add')).toBeVisible();
  });
});
