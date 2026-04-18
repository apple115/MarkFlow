import { useRef, useState, useCallback } from 'react';
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx,
  editorViewCtx,
  serializerCtx,
  parserCtx,
  schemaCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { history } from '@milkdown/kit/plugin/history';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { DOMSerializer } from '@milkdown/kit/prose/model';
import { processDrop } from './dropHandler';
import { log } from './logger';

export interface MilkdownHandle {
  getMarkdown: () => string;
  getHtml: () => string;
  insertMarkdown: (md: string, pos?: number) => void;
  clear: () => void;
  isEmpty: () => boolean;
}

/**
 * Hook to initialize a headless Milkdown editor.
 * Returns a callback ref to attach to the mount point div, plus handle/loading state.
 */
export function useMilkdown(): {
  rootRef: (el: HTMLDivElement | null) => void;
  handle: MilkdownHandle | null;
  loading: boolean;
} {
  const editorRef = useRef<Editor | null>(null);
  const handleRef = useRef<MilkdownHandle | null>(null);
  const ctxRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState<MilkdownHandle | null>(null);

  const rootRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    if (editorRef.current) return;

    let destroyed = false;

    const editor = Editor.make()
      .config((ctx) => {
        // Store ctx for external access
        ctxRef.current = ctx;

        ctx.set(rootCtx, el);
        ctx.set(defaultValueCtx, '');
        ctx.set(editorViewOptionsCtx, {
          attributes: { class: 'milkdown-editor outline-none' },
          editable: () => true,
        });
      })
      .use(commonmark)
      .use(history)
      .use(clipboard)
      .create();

    editor.then((ed) => {
      if (destroyed) return;
      editorRef.current = ed;
      const h = buildHandle(ed);
      handleRef.current = h;
      setLoading(false);
      setHandle(h);
      log.info('Milkdown editor initialized');
    });

    // ── DOM-level drop handler ──
    // Bypass Prosemirror's handleDrop prop mechanism entirely.
    // Attach directly to the mount element to catch all drops.
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      log.info('DOM drop event fired', {
        types: e.dataTransfer?.types,
        files: e.dataTransfer?.files?.length,
      });

      if (!editorRef.current || !ctxRef.current) {
        log.error('Editor not ready for drop');
        return;
      }

      try {
        const ctx = ctxRef.current;
        const view = ctx.get(editorViewCtx);
        const parse = ctx.get(parserCtx);

        if (view.dragging !== null) {
          log.info('Internal editor drag, skipping');
          return;
        }

        processDrop(e, view, parse).catch((err) => {
          log.error('processDrop error:', err);
        });
      } catch (err) {
        log.error('Drop handler error:', err);
      }
    };

    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);

    // Cleanup stored on the element
    (el as any).__cleanup = () => {
      destroyed = true;
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
      if (editorRef.current) {
        editorRef.current.destroy();
      }
      editorRef.current = null;
      handleRef.current = null;
      ctxRef.current = null;
      setHandle(null);
      setLoading(true);
    };
  }, []);

  return { rootRef, handle, loading };
}

function buildHandle(editor: Editor): MilkdownHandle {
  return {
    getMarkdown(): string {
      try {
        let md = '';
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const serializer = ctx.get(serializerCtx);
          md = serializer(view.state.doc);
        });
        return md;
      } catch {
        return '';
      }
    },

    getHtml(): string {
      try {
        let html = '';
        editor.action((ctx) => {
          const schema = ctx.get(schemaCtx);
          const view = ctx.get(editorViewCtx);
          const serializer = DOMSerializer.fromSchema(schema);
          const fragment = serializer.serializeFragment(view.state.doc.content);
          const wrap = document.createElement('div');
          wrap.appendChild(fragment);
          // Limit image size for rich-text pasting (Notes ignores CSS, use attributes)
          wrap.querySelectorAll('img').forEach((img) => {
            img.setAttribute('width', '600');
            img.removeAttribute('height');
          });
          html = wrap.innerHTML;
        });
        return html;
      } catch {
        return '';
      }
    },

    insertMarkdown(md: string, pos?: number): void {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const parser = ctx.get(parserCtx);
        const fragment = parser(md);
        const insertPos = pos != null && pos >= 0 ? pos : view.state.doc.content.size;
        const tr = view.state.tr.insert(insertPos, fragment);
        view.dispatch(tr);
      });
    },

    clear(): void {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const tr = view.state.tr.delete(0, view.state.doc.content.size);
        view.dispatch(tr);
      });
    },

    isEmpty(): boolean {
      let empty = true;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        empty = view.state.doc.content.size <= 2;
      });
      return empty;
    },
  };
}
