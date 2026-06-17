import * as Y from 'yjs';

export type Notebook = {
  id: string;
  name: string;
  updatedAt: number;
  state: string; // Yjs update encoded as base64
};

export type NotebookStore = {
  notebooks: Notebook[];
  activeId: string;
};

const STORE_KEY = 'markflow_notebooks';
export const DEFAULT_NOTEBOOK_NAME = '默认笔记本';
export const NEW_NOTEBOOK_NAME = '笔记本';

function base64ToUint8Array(base64: string): Uint8Array | null {
  if (!base64) return null;
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export function createNotebook(name: string, state?: Uint8Array): Notebook {
  return {
    id: crypto.randomUUID(),
    name,
    updatedAt: Date.now(),
    state: state && state.length > 0 ? uint8ArrayToBase64(state) : '',
  };
}

export function notebookStateToUint8Array(notebook: Notebook): Uint8Array | undefined {
  return base64ToUint8Array(notebook.state) ?? undefined;
}

export async function loadNotebookStore(): Promise<NotebookStore | null> {
  try {
    const result = await browser.storage.local.get(STORE_KEY);
    const raw = result[STORE_KEY];
    if (!raw || typeof raw !== 'string') return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray(parsed.notebooks) &&
      typeof parsed.activeId === 'string'
    ) {
      return parsed as NotebookStore;
    }
  } catch { /* ignore invalid store */ }
  return null;
}

export async function saveNotebookStore(store: NotebookStore): Promise<void> {
  await browser.storage.local.set({ [STORE_KEY]: JSON.stringify(store) });
}

export async function initializeStore(migrateState?: Uint8Array): Promise<NotebookStore> {
  const existing = await loadNotebookStore();
  if (existing) return existing;

  const hasMigrateState = migrateState && migrateState.length > 0;
  const notebook = createNotebook(
    DEFAULT_NOTEBOOK_NAME,
    hasMigrateState ? migrateState : undefined,
  );
  const store: NotebookStore = { notebooks: [notebook], activeId: notebook.id };
  await saveNotebookStore(store);
  return store;
}

export function getNotebook(store: NotebookStore, id: string): Notebook | undefined {
  return store.notebooks.find((n) => n.id === id);
}

export function updateNotebookState(
  store: NotebookStore,
  id: string,
  state: Uint8Array,
): NotebookStore {
  return {
    ...store,
    notebooks: store.notebooks.map((n) =>
      n.id === id
        ? { ...n, state: uint8ArrayToBase64(state), updatedAt: Date.now() }
        : n,
    ),
  };
}

export function renameNotebook(store: NotebookStore, id: string, name: string): NotebookStore {
  return {
    ...store,
    notebooks: store.notebooks.map((n) =>
      n.id === id ? { ...n, name: name.trim() || n.name, updatedAt: Date.now() } : n,
    ),
  };
}

export function addNotebook(store: NotebookStore, notebook: Notebook): NotebookStore {
  return {
    ...store,
    notebooks: [...store.notebooks, notebook],
  };
}

export function deleteNotebook(
  store: NotebookStore,
  id: string,
): { store: NotebookStore; activeId: string } {
  const remaining = store.notebooks.filter((n) => n.id !== id);
  if (remaining.length === 0) {
    const fresh = createNotebook(`${NEW_NOTEBOOK_NAME} 1`);
    return { store: { notebooks: [fresh], activeId: fresh.id }, activeId: fresh.id };
  }

  let newActiveId = store.activeId;
  if (store.activeId === id) {
    const index = store.notebooks.findIndex((n) => n.id === id);
    const fallback = store.notebooks[index === 0 ? 1 : index - 1];
    newActiveId = fallback.id;
  }
  return { store: { notebooks: remaining, activeId: newActiveId }, activeId: newActiveId };
}

export function setActiveNotebook(store: NotebookStore, id: string): NotebookStore {
  if (!store.notebooks.some((n) => n.id === id)) return store;
  return { ...store, activeId: id };
}
