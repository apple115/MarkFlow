import { log } from './logger';
import * as Y from 'yjs';

// --- Room Key ---

const ROOM_KEY_PREFIX = 'markflow-';
const ROOM_KEY_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; // base58

export function generateRoomKey(): string {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  let key = ROOM_KEY_PREFIX;
  for (const b of arr) {
    key += ROOM_KEY_CHARS[b % ROOM_KEY_CHARS.length];
  }
  return key;
}

export function isValidRoomKey(key: string): boolean {
  return /^markflow-[1-9A-HJ-NP-Za-km-z]{12}$/.test(key);
}

// --- Storage ---

const STORAGE_KEY = 'markflow_sync';

export type SyncConfig = {
  roomKey: string;
  serverUrl: string;
};

const DEFAULT_SERVER_URL = 'https://markflow-sync.2567031030.workers.dev';

export async function loadSyncConfig(): Promise<SyncConfig | null> {
  const raw = localStorage.getItem(STORAGE_KEY);
  log.info('Sync: loadSyncConfig from localStorage', raw);
  if (!raw) return null;
  try {
    const val = JSON.parse(raw);
    if (val && typeof val === 'object' && 'roomKey' in val) return val as SyncConfig;
  } catch { /* ignore */ }
  return null;
}

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  log.info('Sync: config saved to localStorage', config);
}

let ensurePromise: Promise<SyncConfig> | null = null;

export function ensureRoomKey(): Promise<SyncConfig> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    let config = await loadSyncConfig();
    if (!config) {
      config = { roomKey: generateRoomKey(), serverUrl: DEFAULT_SERVER_URL };
      await saveSyncConfig(config);
      log.info('Sync: generated new room key', config.roomKey);
    } else {
      log.info('Sync: loaded existing room key', config.roomKey);
    }
    return config;
  })();
  return ensurePromise;
}

// --- Encryption (PBKDF2 → AES-GCM) ---

async function deriveKey(roomKey: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(roomKey),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  // Salt is fixed per room key (deterministic, not for password storage)
  const salt = encoder.encode('markflow-sync-salt');
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(data: Uint8Array, roomKey: string): Promise<Uint8Array> {
  const key = await deriveKey(roomKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data.buffer as ArrayBuffer);
  // prepend iv + ciphertext
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);
  return result;
}

export async function decrypt(data: Uint8Array, roomKey: string): Promise<Uint8Array> {
  const key = await deriveKey(roomKey);
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext.buffer as ArrayBuffer);
  return new Uint8Array(decrypted);
}

// --- KV Snapshot Client ---

export async function fetchSnapshot(serverUrl: string, roomId: string): Promise<Uint8Array | null> {
  const res = await fetch(`${serverUrl}/room/${roomId}/snapshot`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Snapshot fetch failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function uploadSnapshot(serverUrl: string, roomId: string, data: Uint8Array): Promise<void> {
  const res = await fetch(`${serverUrl}/room/${roomId}/snapshot`, {
    method: 'PUT',
    body: data.buffer as ArrayBuffer,
  });
  if (!res.ok) throw new Error(`Snapshot upload failed: ${res.status}`);
}

// --- Helpers ---

/** Derive a short room ID from the room key (for URL paths, not secret) */
export function roomIdFromKey(roomKey: string): string {
  // Simple hash for room identifier (not security-sensitive)
  let hash = 0;
  for (let i = 0; i < roomKey.length; i++) {
    hash = ((hash << 5) - hash + roomKey.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

// --- Yjs Snapshot Sync ---

/**
 * Encrypt and upload current Yjs doc state to KV.
 * Called periodically (every 30s) and on significant changes.
 */
export async function syncUpload(ydoc: Y.Doc, config: SyncConfig): Promise<void> {
  const roomId = roomIdFromKey(config.roomKey);
  const state = Y.encodeStateAsUpdate(ydoc);
  const encrypted = await encrypt(state, config.roomKey);
  await uploadSnapshot(config.serverUrl, roomId, encrypted);
  log.info('Sync: snapshot uploaded', { size: encrypted.length, bytes: state.length });
}

/**
 * Download and decrypt snapshot from KV, apply to Yjs doc.
 * Called on startup to restore state.
 */
export async function syncRestore(ydoc: Y.Doc, config: SyncConfig): Promise<boolean> {
  const roomId = roomIdFromKey(config.roomKey);
  let encrypted: Uint8Array | null = null;
  try {
    encrypted = await fetchSnapshot(config.serverUrl, roomId);
  } catch (err) {
    log.warn('Sync: snapshot fetch failed', err);
    return false;
  }
  if (!encrypted) {
    log.info('Sync: no snapshot found in KV');
    return false;
  }
  try {
    const state = await decrypt(encrypted, config.roomKey);
    Y.applyUpdate(ydoc, state);
    log.info('Sync: snapshot restored', { size: encrypted.length });
    return true;
  } catch (err) {
    log.warn('Sync: snapshot decrypt failed', err);
    return false;
  }
}
