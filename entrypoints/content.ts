export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
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

      browser.runtime.sendMessage({ type: 'dragstart-meta', meta });
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
