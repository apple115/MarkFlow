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
