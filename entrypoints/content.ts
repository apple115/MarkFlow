export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    console.log('[MarkFlow CS] Content script loaded on', window.location.href);

    document.addEventListener('dragstart', () => {
      const meta = {
        url: window.location.href,
        title: document.title,
        siteName: getMetaContent('og:site_name') || window.location.hostname,
        author:
          getMetaContent('author') || getMetaContent('og:article:author'),
        favicon: getFavicon(),
        time: new Date().toLocaleString(),
      };
      console.log('[MarkFlow CS] dragstart → sending meta:', meta);
      browser.runtime.sendMessage({ type: 'dragstart-meta', meta }).then(() => {
        console.log('[MarkFlow CS] meta sent OK');
      }).catch((err: any) => {
        console.error('[MarkFlow CS] meta send FAILED:', err);
      });
    });

    // Listen for screenshot region selection requests
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      console.log('[MarkFlow CS] onMessage received:', message);
      if (message.type === 'start-screenshot-mode') {
        console.log('[MarkFlow CS] Starting screenshot mode...');
        startScreenshotMode()
          .then((rect) => {
            console.log('[MarkFlow CS] Screenshot mode done:', rect);
            sendResponse(rect);
          })
          .catch((err) => {
            console.error('[MarkFlow CS] Screenshot mode error:', err);
            sendResponse(null);
          });
        return true; // keep channel open for async response
      }
    });
  },
});

function getMetaContent(name: string): string | null {
  const el =
    document.querySelector(`meta[property="${name}"]`) ??
    document.querySelector(`meta[name="${name}"]`);
  return el?.getAttribute('content') ?? null;
}

function getFavicon(): string | null {
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel="icon"], link[rel="shortcut icon"]',
  );
  if (link) {
    const href = link.getAttribute('href');
    if (href) {
      try {
        return new URL(href, window.location.origin).href;
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function startScreenshotMode(): Promise<{ x: number; y: number; width: number; height: number; dpr: number } | null> {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(0,0,0,0.25); cursor: crosshair;
    user-select: none; -webkit-user-select: none;
  `;

  const hint = document.createElement('div');
  hint.textContent = 'Drag to select area — Press Escape to cancel';
  hint.style.cssText = `
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.7); color: white; padding: 6px 14px;
    border-radius: 6px; font-size: 13px; font-family: system-ui, sans-serif;
    pointer-events: none; z-index: 2147483648; white-space: nowrap;
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(hint);

  let startX = 0, startY = 0;
  let box: HTMLDivElement | null = null;
  let resolved = false;

  return new Promise((resolve) => {
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      overlay.remove();
      hint.remove();
      resolve(null);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cleanup();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      box = document.createElement('div');
      box.style.cssText = `
        position: fixed; border: 2px dashed #6366f1;
        background: rgba(99,102,241,0.12);
        pointer-events: none; z-index: 2147483648;
      `;
      overlay.appendChild(box);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!box) return;
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      box.style.left = x + 'px';
      box.style.top = y + 'px';
      box.style.width = w + 'px';
      box.style.height = h + 'px';
    };

    const onMouseUp = (e: MouseEvent) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.removeEventListener('mousedown', onMouseDown);
      overlay.removeEventListener('mousemove', onMouseMove);
      overlay.removeEventListener('mouseup', onMouseUp);

      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);

      if (resolved) return;
      resolved = true;
      overlay.remove();
      hint.remove();

      if (w > 4 && h > 4) {
        resolve({
          x: Math.min(startX, e.clientX),
          y: Math.min(startY, e.clientY),
          width: w,
          height: h,
          dpr: window.devicePixelRatio || 1,
        });
      } else {
        resolve(null);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
  });
}
