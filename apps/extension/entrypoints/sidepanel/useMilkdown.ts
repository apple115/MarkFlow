import { useRef, useState, useCallback, useEffect } from 'react';
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
import { $prose } from '@milkdown/utils';
import { DOMSerializer } from '@milkdown/kit/prose/model';
import * as Y from 'yjs';
import { ySyncPlugin } from 'y-prosemirror';
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
 * Hook to initialize a headless Milkdown editor bound to a single notebook.
 * When `notebookId` changes the editor is destroyed and recreated with the
 * notebook's initial Yjs state.
 */
export function useMilkdown(
  notebookId: string,
  initialState?: Uint8Array,
): {
  rootRef: (el: HTMLDivElement | null) => void;
  handle: MilkdownHandle | null;
  loading: boolean;
  ydoc: Y.Doc;
} {
  const editorRef = useRef<Editor | null>(null);
  const handleRef = useRef<MilkdownHandle | null>(null);
  const ctxRef = useRef<any>(null);
  const ydocRef = useRef<Y.Doc>(new Y.Doc());
  const elRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState<MilkdownHandle | null>(null);

  const notebookIdRef = useRef(notebookId);
  notebookIdRef.current = notebookId;
  const initialStateRef = useRef(initialState);
  initialStateRef.current = initialState;

  const destroyEditor = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.destroy();
      editorRef.current = null;
    }
    handleRef.current = null;
    ctxRef.current = null;
    if (ydocRef.current) {
      ydocRef.current.destroy();
      ydocRef.current = new Y.Doc();
    }
    setHandle(null);
    setLoading(true);
  }, []);

  const createEditor = useCallback(() => {
    const el = elRef.current;
    if (!el || editorRef.current) return;

    const ydoc = ydocRef.current;
    const state = initialStateRef.current;
    if (state && state.length > 0) {
      try {
        Y.applyUpdate(ydoc, state);
      } catch (err) {
        log.warn('Failed to apply notebook initial state:', err);
      }
    }

    const yXmlFragment = ydoc.getXmlFragment('prosemirror');
    const syncPlugin = $prose(() => ySyncPlugin(yXmlFragment));

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

    const editor = Editor.make()
      .config((ctx) => {
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
      .use(syncPlugin)
      .create();

    editor.then((ed) => {
      if (editorRef.current) return;
      editorRef.current = ed;
      const h = buildHandle(ed);
      handleRef.current = h;
      setLoading(false);
      setHandle(h);
      log.info('Milkdown editor initialized for notebook', notebookIdRef.current);
    });

    return () => {
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
    };
  }, []);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    destroyEditor();
    const cleanup = createEditor();
    return () => {
      if (cleanup) cleanup();
      destroyEditor();
    };
  }, [notebookId, destroyEditor, createEditor]);

  const rootRef = useCallback(
    (el: HTMLDivElement | null) => {
      elRef.current = el;
      if (!el) {
        destroyEditor();
      }
    },
    [destroyEditor],
  );

  return { rootRef, handle, loading, ydoc: ydocRef.current };
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
