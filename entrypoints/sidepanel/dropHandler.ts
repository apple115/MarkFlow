import type { EditorView } from '@milkdown/kit/prose/view';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';

export interface PendingMeta {
  url: string;
  title: string;
  siteName: string;
  author: string | null;
  favicon: string | null;
  time: string;
}

type ParseMarkdown = (md: string) => ProseNode;

/**
 * Detect the drag type from a DropEvent and insert appropriate content.
 * IMPORTANT: All dataTransfer reads must happen BEFORE any await,
 * because Chrome clears the dataTransfer store once the event handler returns.
 */
export async function processDrop(
  event: DragEvent,
  view: EditorView,
  parseMarkdown: ParseMarkdown,
): Promise<void> {
  console.log('[MarkFlow] processDrop START');

  if (!event.dataTransfer) {
    console.log('[MarkFlow] processDrop: no dataTransfer, abort');
    return;
  }

  event.preventDefault();

  const dt = event.dataTransfer;

  // ── READ ALL DATA SYNCHRONOUSLY before any await ──
  const files = dt.files ? Array.from(dt.files) : [];
  const uriList = dt.getData('text/uri-list');
  const html = dt.getData('text/html');
  const textPlain = dt.getData('text/plain');
  const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });

  console.log('[MarkFlow] processDrop: types =', dt.types);
  console.log('[MarkFlow] processDrop: files =', files.length);
  console.log('[MarkFlow] processDrop: pos =', pos?.pos);
  console.log('[MarkFlow] processDrop: textPlain =', textPlain?.slice(0, 100));
  console.log('[MarkFlow] processDrop: html =', html?.slice(0, 100));
  console.log('[MarkFlow] processDrop: uriList =', uriList?.slice(0, 100));

  // ── NOW safe to do async work ──
  let meta: PendingMeta | null = null;
  try {
    meta = await fetchPendingMeta();
    console.log('[MarkFlow] processDrop: meta =', meta);
  } catch (err) {
    console.warn('[MarkFlow] processDrop: fetchPendingMeta failed:', err);
  }

  // 1. Files (desktop drag)
  if (files.length > 0) {
    console.log('[MarkFlow] processDrop: branch FILES');
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const base64 = await fileToBase64(file);
        const md = buildImageMarkdown(base64, file.type, meta);
        insertMarkdown(view, parseMarkdown, md, pos?.pos);
      } else {
        const md = buildTextMarkdown(`[File: ${file.name}]`, meta);
        insertMarkdown(view, parseMarkdown, md, pos?.pos);
      }
    }
    return;
  }

  // 2. URI list (could be image or link)
  if (uriList) {
    const url = uriList.split('\n')[0].trim();
    console.log('[MarkFlow] processDrop: branch URI-LIST, url =', url);
    if (isImageUrl(url, html)) {
      console.log('[MarkFlow] processDrop: detected as image URL');
      const result = await fetchImageViaBg(url);
      console.log('[MarkFlow] processDrop: image fetch result =', result.error ?? 'ok');
      if (result.base64) {
        const md = buildImageMarkdown(result.base64, result.mimeType!, meta);
        insertMarkdown(view, parseMarkdown, md, pos?.pos);
      } else {
        const md = buildTextMarkdown(`![image](${url})`, meta);
        insertMarkdown(view, parseMarkdown, md, pos?.pos);
      }
    } else {
      const text = textPlain || url;
      const md = buildLinkMarkdown(text, url, meta);
      insertMarkdown(view, parseMarkdown, md, pos?.pos);
    }
    return;
  }

  // 3. HTML content
  if (html) {
    console.log('[MarkFlow] processDrop: branch HTML');
    if (isHtmlImage(html)) {
      const src = extractImageSrc(html);
      console.log('[MarkFlow] processDrop: HTML contains img, src =', src);
      if (src) {
        const result = await fetchImageViaBg(src);
        if (result.base64) {
          const md = buildImageMarkdown(result.base64, result.mimeType!, meta);
          insertMarkdown(view, parseMarkdown, md, pos?.pos);
        } else {
          const md = buildTextMarkdown(`![image](${src})`, meta);
          insertMarkdown(view, parseMarkdown, md, pos?.pos);
        }
        return;
      }
    }
    const text = textPlain || stripHtml(html);
    console.log('[MarkFlow] processDrop: HTML → text =', text.slice(0, 80));
    const md = buildTextMarkdown(text, meta);
    insertMarkdown(view, parseMarkdown, md, pos?.pos);
    return;
  }

  // 4. Plain text
  if (textPlain) {
    console.log('[MarkFlow] processDrop: branch PLAIN TEXT =', textPlain.slice(0, 80));
    const md = buildTextMarkdown(textPlain, meta);
    insertMarkdown(view, parseMarkdown, md, pos?.pos);
    return;
  }

  console.log('[MarkFlow] processDrop: NO MATCHING BRANCH — all data empty');
}

// ── Insert helper ──

function insertMarkdown(
  view: EditorView,
  parse: ParseMarkdown,
  md: string,
  pos?: number,
) {
  try {
    console.log('[MarkFlow] insertMarkdown: md =', md.slice(0, 120));
    console.log('[MarkFlow] insertMarkdown: doc.size =', view.state.doc.content.size, 'pos =', pos);
    const fragment = parse(md);
    console.log('[MarkFlow] insertMarkdown: fragment =', fragment?.toString()?.slice(0, 100));
    if (!fragment) {
      console.error('[MarkFlow] insertMarkdown: parse returned null/empty');
      return;
    }
    const insertPos = pos != null && pos >= 0 ? pos : view.state.doc.content.size;
    const tr = view.state.tr.insert(insertPos, fragment);
    view.dispatch(tr);
    console.log('[MarkFlow] insertMarkdown: DONE, new doc.size =', view.state.doc.content.size);
  } catch (err) {
    console.error('[MarkFlow] insertMarkdown FAILED:', err);
  }
}

// ── Markdown builders ──

function buildTextMarkdown(text: string, meta: PendingMeta | null): string {
  const lines = [`> ${text}`];
  if (meta) {
    lines.push('', `*[${meta.time}] from: ${meta.siteName}*`);
  }
  lines.push('');
  return lines.join('\n');
}

function buildLinkMarkdown(text: string, url: string, meta: PendingMeta | null): string {
  const lines = [`> [${text}](${url})`];
  if (meta) {
    lines.push('', `*[${meta.time}] from: ${meta.siteName}*`);
  }
  lines.push('');
  return lines.join('\n');
}

function buildImageMarkdown(base64: string, mimeType: string, meta: PendingMeta | null): string {
  const lines = [`![image](data:${mimeType};base64,${base64})`];
  if (meta) {
    lines.push('', `*[${meta.time}] from: ${meta.siteName}*`);
  }
  lines.push('');
  return lines.join('\n');
}

// ── Type detection ──

function isImageUrl(url: string, html?: string): boolean {
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const lower = url.toLowerCase().split('?')[0];
  if (imageExts.some((ext) => lower.endsWith(ext))) return true;
  if (html && /<img\b/i.test(html)) return true;
  return false;
}

function isHtmlImage(html: string): boolean {
  return /<img\b[^>]*>/i.test(html) && !/<p\b/i.test(html);
}

function extractImageSrc(html: string): string | null {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

// ── Image fetch via background SW ──

interface ImageResult {
  base64?: string;
  mimeType?: string;
  error?: string;
}

async function fetchImageViaBg(url: string): Promise<ImageResult> {
  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'fetch-image',
      url,
    });
    return resp as ImageResult;
  } catch {
    return { error: 'Failed to fetch image' };
  }
}

// ── Pending metadata from background ──

async function fetchPendingMeta(): Promise<PendingMeta | null> {
  try {
    const meta = await chrome.runtime.sendMessage({ type: 'get-pending-meta' });
    return (meta as PendingMeta) ?? null;
  } catch {
    return null;
  }
}

// ── File to Base64 ──

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
