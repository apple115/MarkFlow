export default defineBackground(() => {
  // Click icon to toggle sidepanel
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Store pending metadata from content scripts, keyed by tabId
  const pendingMeta = new Map<number, PageMeta>();

  // Listen for metadata from content scripts on dragstart
  browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'dragstart-meta' && sender.tab?.id != null) {
      pendingMeta.set(sender.tab.id, message.meta);
    }

    if (message.type === 'fetch-image') {
      console.log('[MarkFlow BG] fetch-image request:', message.url);
      return handleImageFetch(message.url).then((result) => {
        console.log('[MarkFlow BG] fetch-image result:', result.error ?? 'ok');
        return result;
      }).catch((err) => {
        console.error('[MarkFlow BG] fetch-image error:', err);
        return { error: String(err) };
      });
    }

    if (message.type === 'get-pending-meta') {
      // Sidepanel sends messages — sender.tab may be null in that context.
      // Try tabId first, then fall back to returning the most recent meta.
      const tabId = sender.tab?.id;
      if (tabId != null && pendingMeta.has(tabId)) {
        const meta = pendingMeta.get(tabId)!;
        pendingMeta.delete(tabId);
        return Promise.resolve(meta);
      }
      // Fallback: return the last stored meta from any tab, then clear it
      const lastEntry = pendingMeta.entries().next();
      if (!lastEntry.done) {
        const [id, meta] = lastEntry.value;
        pendingMeta.delete(id);
        return Promise.resolve(meta);
      }
      return Promise.resolve(null);
    }
  });
});

interface PageMeta {
  url: string;
  title: string;
  siteName: string;
  author: string | null;
  favicon: string | null;
  time: string;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

async function handleImageFetch(
  url: string,
): Promise<{ base64?: string; mimeType?: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) {
      return { error: `HTTP ${resp.status}` };
    }

    const contentType = resp.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      return { error: 'Not an image' };
    }

    const contentLength = parseInt(resp.headers.get('content-length') ?? '0');
    if (contentLength > MAX_IMAGE_SIZE) {
      return { error: 'Image too large (>10MB)' };
    }

    const buffer = await resp.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_SIZE) {
      return { error: 'Image too large (>10MB)' };
    }

    const base64 = arrayBufferToBase64(buffer);
    return { base64, mimeType: contentType };
  } catch (err) {
    return { error: String(err) };
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
