import type { EditorView } from '@milkdown/kit/prose/view';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { log } from './logger';

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
  log.info('processDrop START');

  if (!event.dataTransfer) {
    log.info('processDrop: no dataTransfer, abort');
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

  log.info('processDrop: types =', dt.types);
  log.info('processDrop: files =', files.length);
  log.info('processDrop: pos =', pos?.pos);
  log.info('processDrop: textPlain =', textPlain?.slice(0, 100));
  log.info('processDrop: html =', html?.slice(0, 100));
  log.info('processDrop: uriList =', uriList?.slice(0, 100));

  // ── NOW safe to do async work ──
  let meta: PendingMeta | null = null;
  try {
    meta = await fetchPendingMeta();
    log.info('processDrop: meta =', meta);
  } catch (err) {
    log.warn('processDrop: fetchPendingMeta failed:', err);
  }

  // 1. Files (desktop drag)
  if (files.length > 0) {
    log.info('processDrop: branch FILES');
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

  // 2. URI list (could be video, image or link)
  if (uriList) {
    const url = uriList.split('\n')[0].trim();
    log.info('processDrop: branch URI-LIST, url =', url);
    if (isVideoUrl(url)) {
      log.info('processDrop: detected as video URL');
      const md = buildVideoMarkdown(url, meta);
      insertMarkdown(view, parseMarkdown, md, pos?.pos);
    } else if (isImageUrl(url, html)) {
      log.info('processDrop: detected as image URL');
      const result = await fetchImageViaBg(url);
      log.info('processDrop: image fetch result =', result?.error ?? 'ok');
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
    log.info('processDrop: branch HTML');
    if (isHtmlVideo(html)) {
      const src = extractVideoSrc(html);
      log.info('processDrop: HTML contains video, src =', src);
      if (src) {
        const md = buildVideoMarkdown(src, meta);
        insertMarkdown(view, parseMarkdown, md, pos?.pos);
        return;
      }
    }
    if (isHtmlImage(html)) {
      const src = extractImageSrc(html);
      log.info('processDrop: HTML contains img, src =', src);
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
    log.info('processDrop: HTML → text =', text.slice(0, 80));
    const md = buildTextMarkdown(text, meta);
    insertMarkdown(view, parseMarkdown, md, pos?.pos);
    return;
  }

  // 4. Plain text
  if (textPlain) {
    log.info('processDrop: branch PLAIN TEXT =', textPlain.slice(0, 80));
    const md = buildTextMarkdown(textPlain, meta);
    insertMarkdown(view, parseMarkdown, md, pos?.pos);
    return;
  }

  log.info('processDrop: NO MATCHING BRANCH — all data empty');
}

// ── Insert helper ──

function insertMarkdown(
  view: EditorView,
  parse: ParseMarkdown,
  md: string,
  pos?: number,
) {
  try {
    log.info('insertMarkdown: md =', md.slice(0, 120));
    log.info('insertMarkdown: doc.size =', view.state.doc.content.size, 'pos =', pos);
    const fragment = parse(md);
    log.info('insertMarkdown: fragment =', fragment?.toString()?.slice(0, 100));
    if (!fragment) {
      log.error('insertMarkdown: parse returned null/empty');
      return;
    }
    const insertPos = pos != null && pos >= 0 ? pos : view.state.doc.content.size;
    const tr = view.state.tr.insert(insertPos, fragment);
    view.dispatch(tr);
    log.info('insertMarkdown: DONE, new doc.size =', view.state.doc.content.size);
  } catch (err) {
    log.error('insertMarkdown FAILED:', err);
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

// ── Type detection ──

function isVideoUrl(url: string): boolean {
  const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.ogv'];
  const lower = url.toLowerCase().split('?')[0].split('#')[0];
  return videoExts.some((ext) => lower.endsWith(ext));
}

function isHtmlVideo(html: string): boolean {
  return /<video\b/i.test(html);
}

function extractVideoSrc(html: string): string | null {
  // <video src="...">
  const direct = html.match(/<video[^>]+src=["']([^"']+)["']/i);
  if (direct) return direct[1];
  // <video><source src="...">
  const source = html.match(/<source[^>]+src=["']([^"']+)["']/i);
  return source?.[1] ?? null;
}

function buildVideoMarkdown(url: string, meta: PendingMeta | null): string {
  const lines = [`> [▶ Video](${url})`];
  if (meta) {
    lines.push('', `*[${meta.time}] from: ${meta.siteName}*`);
  }
  lines.push('');
  return lines.join('\n');
}

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
    return resp ?? { error: 'No response from background' };
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
