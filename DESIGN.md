# MarkFlow — Design Document

> A minimalist Chrome sidepanel extension for capturing, refining, and exporting web content as Markdown.

---

## 1. Core Philosophy

| Principle | Description |
|-----------|-------------|
| **No data ownership** | Not a database — a transit station. Content flows in, gets refined, flows out. |
| **Invisible formatting** | Milkdown delivers WYSIWYG. Drag in text → it becomes a blockquote. Drag in an image → it renders inline. |
| **Physical feel** | The drag gesture from webpage to sidepanel mimics clipping paper into a notebook. |

---

## 2. Tech Stack

| Module | Choice | Reason |
|--------|--------|--------|
| Framework | **WXT** (Vite + pnpm) | Best practice for modern Chrome extensions. HMR, minimal config. |
| View Layer | **React 18** | Fast UI iteration with TailwindCSS. |
| Editor | **Milkdown v7** | Prosemirror-based, WYSIWYG, plugin architecture. The core component. |
| Styling | **TailwindCSS** | Atomic CSS for tight sidepanel layout adjustments. |
| Testing | **Vitest** | Validate drag-parsing logic (URL → Base64, etc.). |

---

## 3. User Flow

```
Entry → Capture → Refinement → Export
```

### 3.1 Entry — Instant Start

- Click the extension icon or press **Alt + S** to open the sidepanel.
- A clean, blank editing area appears with cursor ready.

### 3.2 Capture — Fragment Collection

**Text drag:**

1. User selects text on the page, holds and drags into the sidepanel.
2. Plugin detects plain text → wraps as Markdown blockquote `> [text]`.
3. Source metadata is automatically appended.

**Image drag:**

1. User holds an image and drags it into the sidepanel.
2. Plugin fetches the image blob → converts to Base64 via Background SW.
3. Inserts as `![image](data:image/...)` — renders inline immediately.

**Auto-source tracking:**

- Every drop silently appends the origin URL (e.g. `via: github.com`).

### 3.3 Refinement — Quick Internalization

- Edit directly below quoted content (Feynman technique: rephrase in your own words).
- Type `#` or `-` and Milkdown renders headings/lists in real time.
- Reorder content blocks freely within the editor.

### 3.4 Export — Flow Out & Reset

1. Click **Copy** → all content converts to standard Markdown source.
2. Brief toast: "Markdown ready".
3. Paste into Obsidian / Notion / Logseq — text, formatting, Base64 images all intact.
4. Click **Clear** → sidepanel resets to blank.

---

## 4. UI Design — "Invisible Design"

### 4.1 Visual Identity

- **Palette:** Minimalist white / deep-space gray. System-level dark mode.
- **Texture:** Subtle shadows (`shadow-sm`) and frosted glass (`backdrop-blur`).
- **Typography:** System font stack (Inter / PingFang SC) for clear heading/body hierarchy.

### 4.2 Layout

```
┌──────────────────────────────────┐
│  HEADER (48px fixed)             │
│  [● Status] MarkFlow    [Copy][🗑]│
├──────────────────────────────────┤
│                                  │
│  EDITOR AREA (flex: 1)           │
│                                  │
│  Placeholder:                    │
│  "将网页文字或图片拖拽至此..."       │
│                                  │
│  > Dragged-in content (blockquote│
│  with indigo left border)        │
│                                  │
│  User's own notes (plain text)   │
│                                  │
├──────────────────────────────────┤
│  FOOTER (24px, optional)         │
│  128 chars · Alt+S to toggle     │
└──────────────────────────────────┘
```

**Header (48px):**

- Left: Logo + status dot (gray = empty, green = content present).
- Right: **Copy** (primary, `bg-indigo-600`) + **Clear** (icon-only trash, with mini confirmation bubble).

**Editor Area (flex: 1):**

- Borderless. Padding `p-6` for breathing room.
- Custom Milkdown styles:
  - Blockquote: `border-l-4 border-indigo-500`, faint background.
  - Images: `rounded-lg`, `hover:ring-2`.
  - Empty state placeholder text in muted color.

**Footer (24px, optional):**

- Character count + rotating tips.

### 4.3 Micro-interactions

| Interaction | Behavior |
|-------------|----------|
| **Drag overlay** | When external element enters sidepanel: blue tint overlay (`bg-blue-50/50`) with "Drop to add" text + icon. `transition-all` smooth entry. |
| **Copy toast** | Checkmark icon appears below Copy button. Auto-dismiss after 2s. No modal. |
| **Image loading** | Skeleton placeholder while Base64 conversion runs. Non-blocking — user can keep typing/dropping. |
| **Scrollbar** | Hidden or ultra-thin for native app feel. |
| **Responsive images** | `max-width: 100%` for sidepanel resize. |

---

## 5. Metadata Design

### 5.1 Core Metadata (Must-Have)

| Field | Purpose |
|-------|---------|
| `sourceUrl` | Trace back to original page. |
| `pageTitle` | Used as heading in exported Markdown. |
| `timestamp` | Per-fragment time for chronological sorting. |

### 5.2 Enhanced Metadata (Utility)

| Field | Purpose |
|-------|---------|
| `favicon` | Visual origin indicator — brain processes icons faster than text. |
| `siteName` | e.g. "Medium" / "GitHub" — cleaner than raw domain. |
| `author` | If extractable, adds depth to the note. |

### 5.3 Markdown Export Structure

```markdown
# [Page Title](Source URL)

> [2026-04-14 16:05] From: siteName

---

> Dragged-in content fragment (blockquote)

User's own thoughts and annotations (body text)
```

### 5.4 Data Acquisition

```typescript
// In content script — runs on every page load
const meta = {
  url: window.location.href,
  title: document.title,
  siteName: getMetaContent('og:site_name') || window.location.hostname,
  author: getMetaContent('author') || getMetaContent('og:article:author'),
  // Prefer page's own favicon over Google's service (unreliable in China)
  favicon: getFavicon() || `https://www.google.com/s2/favicons?domain=${window.location.hostname}`,
  time: new Date().toLocaleString(),
};

function getFavicon(): string | null {
  const link = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
  if (link) {
    const href = link.getAttribute('href');
    if (href) return new URL(href, window.location.origin).href;
  }
  return null;
}
```

---

## 6. Storage Strategy

- **Use `chrome.storage.session`** (MV3 session-level storage), NOT `localStorage`.
- Why: `localStorage` has a 5MB cap — a single Base64 image can consume 2MB+. `chrome.storage.session` has no such limit and is async (non-blocking).
- Prevents data loss on accidental browser close.
- **Clear** button calls `chrome.storage.session.clear()`.
- Auto-cleanup: session storage is wiped when the browser session ends.

---

## 7. Architecture — Implementation Decisions

### 7.1 Extension Contexts & Communication

Sidepanel and webpage are **separate browsing contexts**. `dataTransfer` custom MIME types do NOT reliably survive the cross-context boundary. Only browser-native types (`text/plain`, `text/html`, `text/uri-list`) survive with varying reliability.

**Architecture: message-passing + dataTransfer dual-track**

```
[Content Script]                  [Background SW]                [Sidepanel]

dragstart event                   caches pendingMeta             stores pendingMeta
  → extract metadata       ───→   in Map<tabId, meta>    ───→   via onMessage listener
  → send via runtime.sendMessage

                                                         ↓ (user drops)

drop event                                                     reads text/plain
                                                               from dataTransfer
                                                               + reads pendingMeta
                                                               → combine & insert
```

**Why two channels:**
- `dataTransfer` carries the actual **content** (text, HTML) — this survives cross-context.
- Message passing carries the **metadata** (url, title, favicon) — this doesn't survive in dataTransfer.

### 7.2 Manifest Permissions

```jsonc
{
  "manifest_version": 3,
  "permissions": [
    "activeTab",          // Access current tab info
    "sidePanel",          // Sidepanel API
    "storage"             // chrome.storage.session
  ],
  "host_permissions": [
    "https://*/*",        // Cross-origin image fetch via SW
    "http://*/*"
  ],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content-scripts/drag-listener.js"],
    "run_at": "document_idle"
  }]
}
```

**Trade-off:** `host_permissions` + `content_scripts` on `<all_urls>` triggers Chrome's "can read all site data" warning at install. This is unavoidable for the drag-metadata and image-fetch features. Minimal set — no extra permissions.

### 7.3 Drag Type Detection Matrix

Not just "text" and "image" — the `drop` handler must classify all incoming types:

| Drag source | `dataTransfer.types` | Handling strategy |
|-------------|----------------------|-------------------|
| Selected text | `text/plain` | Wrap in blockquote `> {text}` |
| Dragged `<img>` | `text/uri-list` + `text/html` | Extract URL → fetch as image via BG SW |
| Dragged link `<a>` | `text/uri-list` | Insert as Markdown link `[text](url)` |
| Dragged file from desktop | `Files` | Read via FileReader → Base64 insert |
| Dragged `<video>` | `text/uri-list` | Extract poster image or insert as link (video not embeddable in MD) |
| SVG inline | `text/html` or `text/plain` | Attempt to render as `<img>` with data URI |
| Mixed DOM block | `text/html` | Parse HTML → convert to Markdown via turndown or manual extraction |

**Detection priority (first match wins):**

```
1. dataTransfer.files.length > 0     → File handler
2. types includes 'text/uri-list'     → Check if URL points to image (HEAD request or extension check)
                                       → Image handler or Link handler
3. types includes 'text/html'         → HTML → Markdown converter
4. types includes 'text/plain'        → Text → Blockquote wrapper
5. else                               → Reject with subtle "unsupported" feedback
```

### 7.4 Milkdown Integration

**Minimal plugin set (no toolbar, no slash commands):**

```typescript
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { history } from '@milkdown/kit/plugin/history';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
// NOT importing: slash, tooltip, block, upload, cursor
```

**Headless CSS strategy:** Do NOT use Nord theme. Write custom CSS targeting `.ProseMirror` and node classes. Reasons:
- Nord theme adds ~40KB and is designed for desktop widths
- Sidepanel at 320px needs heavily customized blockquote, code-block, and table styles
- Full control over dark mode styling

**External drop interception via Prosemirror handleDrop:**

Prosemirror has built-in drag-and-drop for internal block reordering. We must intercept to distinguish internal vs external drops:

```typescript
editor.config((ctx) => {
  ctx.set(editorViewOptionsCtx, {
    handleDrop(view, event, slice, moved) {
      if (view.dragging !== null) {
        // Internal editor drag (block reordering) → let Prosemirror handle
        return false;
      }
      // External drag (from webpage) → our handler
      handleExternalDrop(event, view, ctx);
      return true; // prevent Prosemirror default
    },
    handleDOMEvents: {
      dragover(view, event) {
        event.preventDefault(); // REQUIRED: without this, drop event won't fire
      },
    },
  });
});
```

**Content insertion at drop position:**

`editor.action(insert(md))` only inserts at cursor. For drop-to-position:

```typescript
function handleExternalDrop(event: DragEvent, view: EditorView, ctx: Ctx) {
  const coords = { left: event.clientX, top: event.clientY };
  const pos = view.posAtCoords(coords);

  if (pos) {
    // Parse markdown → Prosemirror fragment → insert at exact position
    const parser = ctx.get(parserCtx);
    const fragment = parser(markdownString);
    const tr = view.state.tr.insert(pos.pos, fragment);
    view.dispatch(tr);
  } else {
    // Fallback: editor is empty, posAtCoords returns null → append at end
    editor.action(insert(markdownString));
  }
}
```

### 7.5 Image Processing Pipeline

Sidepanel cannot fetch cross-origin images directly (CORS). All image fetching goes through the Background Service Worker:

```
Sidepanel                           Background SW
────────                           ─────────────
1. Extract image URL from drop
2. sendMessage({
     type: 'fetch-image',
     url: imageUrl                  3. fetch(url) ← host_permissions bypasses CORS
   })                               4. response.arrayBuffer()
                                    5. arrayBufferToBase64(buffer)
                                    6. Return { base64, mimeType }
7. Receive { base64, mimeType }
8. Insert into editor:
   ![img](data:{mimeType};base64,{base64})
```

**ArrayBuffer → Base64 in Service Worker** (no FileReader available):

```typescript
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  // Chunked to avoid call stack overflow on large images
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}
```

**Timeout and size guard:**

```typescript
// In Background SW — reject oversized images to prevent browser hang
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB raw → ~13MB Base64

async function fetchImage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

  const resp = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);

  const contentLength = parseInt(resp.headers.get('content-length') || '0');
  if (contentLength > MAX_IMAGE_SIZE) {
    return { error: 'Image too large (>10MB). Inserted as link instead.' };
  }
  // ... proceed with conversion
}
```

**Fallback for fetch failures:** If image fetch fails (CORS despite host_permissions, 404, timeout), insert as a Markdown image link with the original URL instead of Base64. User sees a broken image in editor but the URL is preserved.

### 7.6 Multi-Source Content Organization

When content comes from multiple pages, export structure groups by source:

```markdown
# MarkFlow Export — 2026-04-14

---

## [Page Title 1](URL 1)
> [16:05] From: GitHub

> Fragment from page 1

My notes on this...

---

## [Page Title 2](URL 2)
> [16:12] From: Medium

> Fragment from page 2

My notes on this...
```

**Implementation:** Each dragged fragment carries its own metadata. On export, group by `sourceUrl`, then sort by `timestamp` within each group. If only one source, use the simpler single-source template.

### 7.7 Clipboard Export

```typescript
async function copyMarkdownToClipboard() {
  const md = editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const serializer = ctx.get(serializerCtx);
    return serializer(view.state.doc);
  });

  try {
    await navigator.clipboard.writeText(md);
    showToast('Markdown ready');
  } catch {
    // Fallback for contexts where Clipboard API is restricted
    const textarea = document.createElement('textarea');
    textarea.value = md;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('Markdown ready');
  }
}
```

### 7.8 Pages Where the Extension Cannot Work

| Page type | Issue | Fallback behavior |
|-----------|-------|-------------------|
| `chrome://` pages | Cannot inject content script | Drop works but no metadata; show subtle "source unknown" badge |
| Chrome Web Store | Cannot inject content script | Same fallback |
| `chrome-extension://` | Sidepanel can't open here | Extension icon disabled |
| PDF viewer (built-in) | No content script injection | Drop works but no metadata |
| New Tab page | No real content to capture | Sidepanel works but no source page context |

**Design principle:** The editor always works. Metadata is best-effort — if unavailable, the content is still inserted, just without source attribution.

---

## 8. Edge Cases & Error Handling

### 8.1 Drag & Drop Edge Cases

| Scenario | Handling |
|----------|----------|
| User drops while image from previous drop is still converting | Queue is per-drop; each conversion is independent. Non-blocking. |
| User drops, then immediately types | Editor accepts input normally; converted image inserts at the queued position when ready. |
| Drop on empty editor → `posAtCoords` returns null | Fallback: append at document end via `insert()` macro. |
| Content script not yet injected when drag starts | Metadata missing. Insert content without source attribution. No error shown. |
| User drags from sidepanel to sidepanel (self-drop) | Prosemirror's `view.dragging !== null` → treated as internal reorder. |
| Multiple rapid drags before first processes | Each drop triggers independent processing. Skeleton placeholders stack. |

### 8.2 Image Edge Cases

| Scenario | Handling |
|----------|----------|
| Image URL returns HTML (not an image) | Check `Content-Type` header. If not `image/*`, treat as link not image. |
| Image > 10MB | Reject Base64 conversion. Insert as `[image link](url)` instead. |
| Image fetch times out (15s) | Show inline error: "Image failed to load" with retry option. |
| Image is SVG with scripts | Sanitize: strip `<script>` tags before converting to data URI. |
| Image is a data URI already | Skip fetch. Use directly. |
| Image is a GIF (animated) | Base64 preserves animation but size can be very large. Apply same size limit. |
| Lazy-loaded image (placeholder src) | Attempt to extract actual URL from `data-src` or `data-original` attributes in the HTML payload. |

### 8.3 Editor Edge Cases

| Scenario | Handling |
|----------|----------|
| Chinese IME composing conflicts with Milkdown | Test with all major IME (Sogou, macOS Chinese). Known Prosemirror issue — may need `handleTextInput` workaround. |
| Very large document (many fragments + images) | Monitor Prosemirror `doc.content.size`. Warn at >500KB serialized content. |
| Milkdown init fails | Show plain `<textarea>` as degraded fallback with a "Restart editor" button. |
| Dark mode toggle while content present | Milkdown re-renders via CSS custom properties. No content loss. |

### 8.4 Export Edge Cases

| Scenario | Handling |
|----------|----------|
| Empty editor → Copy clicked | Disable Copy button when editor is empty (check `doc.content.size === 0`). |
| Exported Markdown has deeply nested blockquotes | CommonMark serializer handles this correctly. Verify with round-trip test. |
| Base64 image string too long for target app's clipboard | Provide Copy options: "With images (Base64)" / "Text only (images as URLs)". |
| Special characters in page title (pipes, brackets) | Escape `[`, `]`, `|` in title when building Markdown link syntax. |

---

## 9. Development Roadmap

| Phase | Scope | Goal |
|-------|-------|------|
| **Phase 1** | Environment setup | WXT + Tailwind + Milkdown headless sidepanel running. Manifest configured. |
| **Phase 2** | Content script + message passing | `dragstart` listener in content script. Background SW relays metadata. Sidepanel receives pendingMeta. |
| **Phase 3** | Core drop handler | `handleDrop` in Prosemirror. Drag type detection matrix. Text → blockquote insertion. |
| **Phase 4** | Image pipeline | Background SW image fetch. ArrayBuffer → Base64. Image node insertion. Fallback to link on failure. |
| **Phase 5** | Export | Clipboard API (with execCommand fallback). Markdown serialization. Multi-source grouping. Copy options. |
| **Phase 6** | Polish | Dark mode. Favicon display. Micro-interactions (overlay, toast, skeleton). Footer stats. |
| **Phase 7** | Hardening | IME testing. Edge case coverage. Error boundaries. Performance profiling (editor init time < 200ms). |
