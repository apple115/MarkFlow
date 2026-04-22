import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useMilkdown } from './useMilkdown';
import { downloadLogs, log } from './logger';
import { settings } from './settings';
import { ensureRoomKey, isValidRoomKey, saveSyncConfig, syncUpload, syncRestore, type SyncConfig } from './sync';
import { SyncConnection } from './syncConnection';

function detectDragType(dt: DataTransfer): 'text' | 'image' | 'link' | 'file' {
  const types = Array.from(dt.types).map((t) => t.toLowerCase());
  if (types.includes('files')) return 'image';
  if (types.includes('text/uri-list')) return 'link';
  if (types.includes('text/html') || types.includes('text/plain')) return 'text';
  return 'text';
}

function DragTypeIcon({ type }: { type: 'text' | 'image' | 'link' | 'file' }) {
  const paths: Record<string, ReactNode> = {
    text: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </>
    ),
    file: (
      <>
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="13 2 13 9 20 9" />
      </>
    ),
  };
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-blue-500 dark:text-blue-300" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[type]}
    </svg>
  );
}

export default function App() {
  const { rootRef, handle, loading, ydoc } = useMilkdown();
  const [dragState, setDragState] = useState<{ active: boolean; type: 'text' | 'image' | 'link' | 'file' } | null>(null);
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied'>('idle');
  const [charCount, setCharCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ssMenuOpen, setSsMenuOpen] = useState(false);
  const [modal, setModal] = useState<'drag' | 'clear' | 'sync' | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [includeDate, setIncludeDate] = useState(settings.includeDate);
  const [includeTime, setIncludeTime] = useState(settings.includeTime);
  const [includeSource, setIncludeSource] = useState(settings.includeSource);
  const menuRef = useRef<HTMLDivElement>(null);
  const ssMenuRef = useRef<HTMLDivElement>(null);
  const clearRef = useRef<HTMLDivElement>(null);

  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);
  const [syncCopied, setSyncCopied] = useState(false);
  const [bindInput, setBindInput] = useState('');
  const [serverInput, setServerInput] = useState('');
  const [syncStatus, setSyncStatus] = useState<'offline' | 'online' | 'syncing'>('offline');

  // Load sync config on mount
  useEffect(() => {
    ensureRoomKey().then(setSyncConfig);
  }, []);

  // Restore from KV snapshot on first load, then upload periodically
  useEffect(() => {
    if (!syncConfig || loading) return;
    // Restore snapshot on startup
    syncRestore(ydoc, syncConfig).then((restored) => {
      if (restored) log.info('Sync: restored snapshot from KV');
    });
    // Upload snapshot every 30s
    const id = setInterval(() => {
      syncUpload(ydoc, syncConfig).catch((err) => log.warn('Sync upload failed:', err));
    }, 30_000);
    // Force upload on hide/close to avoid losing recent edits
    const onHide = () => {
      if (document.hidden) {
        syncUpload(ydoc, syncConfig).catch((err) => log.warn('Sync flush failed:', err));
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [syncConfig, loading, ydoc]);

  // P2P sync: create SyncConnection and broadcast Yjs updates
  useEffect(() => {
    if (!syncConfig || loading) return;
    const conn = new SyncConnection(ydoc, syncConfig, setSyncStatus);
    conn.connect();

    const onUpdate = (update: Uint8Array) => {
      conn.broadcastUpdate(update);
    };
    ydoc.on('update', onUpdate);

    return () => {
      ydoc.off('update', onUpdate);
      conn.destroy();
    };
  }, [syncConfig, loading, ydoc]);

  const hasContent = !loading && handle != null && !handle.isEmpty();

  const toggleDate = useCallback((v: boolean) => {
    setIncludeDate(v);
  }, []);

  const toggleTime = useCallback((v: boolean) => {
    setIncludeTime(v);
  }, []);

  const toggleSource = useCallback((v: boolean) => {
    setIncludeSource(v);
  }, []);

  const saveSettings = useCallback(() => {
    settings.includeDate = includeDate;
    settings.includeTime = includeTime;
    settings.includeSource = includeSource;
    log.info('Settings saved:', { includeDate, includeTime, includeSource });
    setModal(null);
  }, [includeDate, includeTime, includeSource]);

  useEffect(() => {
    if (!handle) return;
    const id = setInterval(() => {
      setCharCount(handle.getMarkdown().length);
    }, 500);
    return () => clearInterval(id);
  }, [handle]);

  // Close menus/popovers on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (ssMenuOpen && ssMenuRef.current && !ssMenuRef.current.contains(e.target as Node)) {
        setSsMenuOpen(false);
      }
      if (modal === 'clear' && clearRef.current && !clearRef.current.contains(e.target as Node)) {
        setModal(null);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen, ssMenuOpen, modal]);

  // Image click → lightbox
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG' && target.closest('.ProseMirror')) {
        e.preventDefault();
        e.stopPropagation();
        setLightbox((target as HTMLImageElement).src);
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!handle) return;
    setStatus('copying');
    try {
      const md = handle.getMarkdown();
      const html = handle.getHtml();
      const blobHtml = new Blob([html], { type: 'text/html' });
      const blobText = new Blob([md], { type: 'text/plain' });
      const item = new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText });
      await navigator.clipboard.write([item]);
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      // Fallback: plain text only
      const md = handle.getMarkdown();
      const ta = document.createElement('textarea');
      ta.value = md;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 2000);
    }
  }, [handle]);

  const confirmClear = useCallback(() => {
    if (!handle) return;
    handle.clear();
    setCharCount(0);
    setModal(null);
  }, [handle]);

  async function getWebpageTab(): Promise<any | null> {
    const tabs = await browser.tabs.query({ active: true });
    for (const t of tabs) {
      if (t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://')) {
        return t;
      }
    }
    return null;
  }

  async function compressScreenshot(dataUrl: string, maxSize = 100_000, maxWidth = 1200): Promise<string> {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = dataUrl; });

    // Hard cap on pixel dimensions so pasted images don't blow up in Notes
    let scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
    let quality = 0.92;
    let result = '';

    for (let attempt = 0; attempt < 8; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      result = canvas.toDataURL('image/jpeg', quality);
      const size = result.split(',')[1].length;
      log.info('Screenshot compress', { attempt, scale: +scale.toFixed(3), quality: +quality.toFixed(2), width: canvas.width, size });
      if (size <= maxSize) return result;
      if (attempt < 3) quality *= 0.65;
      else scale *= 0.65;
    }
    return result;
  }

  const doFullScreenshot = useCallback(async () => {
    if (!handle) return;
    try {
      const tab = await getWebpageTab();
      if (!tab?.id) { log.warn('No webpage tab found'); return; }
      log.info('Full screenshot: capturing tab', tab.id, tab.url);

      const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      const compressed = await compressScreenshot(dataUrl);
      const base64 = compressed.split(',')[1];
      const mime = compressed.includes('image/jpeg') ? 'image/jpeg' : 'image/png';

      const url = tab.url ? new URL(tab.url) : null;
      const metaParts: string[] = [];
      const now = new Date();
      if (settings.includeDate) metaParts.push(now.toLocaleDateString());
      if (settings.includeTime) metaParts.push(now.toLocaleTimeString());
      if (settings.includeSource && url) metaParts.push(`from: ${url.hostname}`);

      let md = `![image](data:${mime};base64,${base64})`;
      if (metaParts.length > 0) md += `\n\n*${metaParts.join(' • ')}*`;
      md += '\n';

      handle.insertMarkdown(md);
      log.info('Full screenshot inserted, base64 size =', base64.length);
    } catch (err) {
      log.error('Screenshot failed:', err);
    }
  }, [handle]);

  const doRegionScreenshot = useCallback(async () => {
    if (!handle) return;
    try {
      const tab = await getWebpageTab();
      if (!tab?.id) { log.warn('No webpage tab found'); return; }
      log.info('Region screenshot: sending message to tab', tab.id);

      const rect = await browser.tabs.sendMessage(tab.id, { type: 'start-screenshot-mode' });
      if (!rect) { log.info('Region selection cancelled'); return; }
      log.info('Region rect =', rect);

      const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = dataUrl; });

      const dpr = rect.dpr || 1;
      const sx = rect.x * dpr;
      const sy = rect.y * dpr;
      const sw = rect.width * dpr;
      const sh = rect.height * dpr;

      const canvas = document.createElement('canvas');
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, rect.width, rect.height);

      const raw = canvas.toDataURL('image/png');
      const compressed = await compressScreenshot(raw);
      const base64 = compressed.split(',')[1];
      const mime = compressed.includes('image/jpeg') ? 'image/jpeg' : 'image/png';

      const url = tab.url ? new URL(tab.url) : null;
      const metaParts: string[] = [];
      const now = new Date();
      if (settings.includeDate) metaParts.push(now.toLocaleDateString());
      if (settings.includeTime) metaParts.push(now.toLocaleTimeString());
      if (settings.includeSource && url) metaParts.push(`from: ${url.hostname}`);

      let md = `![image](data:${mime};base64,${base64})`;
      if (metaParts.length > 0) md += `\n\n*${metaParts.join(' • ')}*`;
      md += '\n';

      handle.insertMarkdown(md);
      log.info('Region screenshot inserted, base64 size =', base64.length);
    } catch (err) {
      log.error('Region screenshot failed:', err);
    }
  }, [handle]);

  const onDragStateChange = useCallback((state: { active: boolean; type?: 'text' | 'image' | 'link' | 'file' }) => {
    setDragState(state.active ? { active: true, type: state.type || 'text' } : null);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between h-8 px-4 border-b border-gray-200 dark:border-gray-700 shrink-0 relative">
        <span
          className={`w-2 h-2 rounded-full ${
            hasContent ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        />
        <div className="flex items-center gap-1.5">
          {/* Copy */}
          <button
            onClick={handleCopy}
            className={`p-1.5 rounded active:scale-90 active:opacity-60 transition-all duration-150 ${
              status === 'copied'
                ? 'text-green-500'
                : 'text-gray-400 hover:text-indigo-500'
            }`}
            title="Copy Markdown"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          {/* Screenshot dropdown */}
          <div ref={ssMenuRef} className="relative">
            <button
              onClick={() => setSsMenuOpen((v) => !v)}
              className="p-1.5 text-gray-400 hover:text-indigo-500 active:scale-90 active:opacity-60 transition-all duration-150"
              title="Screenshot"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
            <div
              className="absolute top-full right-0 mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-30"
              style={{
                opacity: ssMenuOpen ? 1 : 0,
                transform: ssMenuOpen ? 'translateY(0) scaleY(1)' : 'translateY(-4px) scaleY(0.9)',
                transformOrigin: 'top right',
                pointerEvents: ssMenuOpen ? 'auto' : 'none',
                transition: 'opacity 150ms, transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <button
                onClick={() => { setSsMenuOpen(false); doFullScreenshot(); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                Full page
              </button>
              <button
                onClick={() => { setSsMenuOpen(false); doRegionScreenshot(); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-t border-gray-100 dark:border-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3h7v7H3z" />
                  <path d="M14 3h7v7h-7z" />
                  <path d="M14 14h7v7h-7z" />
                  <path d="M3 14h7v7H3z" />
                </svg>
                Select region
              </button>
            </div>
          </div>
          {/* Clear */}
          <div ref={clearRef} className="relative">
            <button
              onClick={() => setModal(modal === 'clear' ? null : 'clear')}
              disabled={!hasContent && modal !== 'clear'}
              className={`p-1.5 rounded active:scale-90 active:opacity-60 transition-all duration-150 ${
                modal === 'clear' ? 'text-red-500' : 'text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed'
              }`}
              title="Clear"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
            <DropdownMenu open={modal === 'clear'} className="w-36">
              <div className="px-3 py-2.5">
                <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">确定清空所有内容？</p>
                <button
                  onClick={confirmClear}
                  className="w-full px-2 py-1.5 text-[11px] font-medium text-white bg-red-500 rounded hover:bg-red-600 transition-colors"
                >
                  清空
                </button>
              </div>
            </DropdownMenu>
          </div>
          {/* Settings gear */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={`p-1.5 rounded active:scale-90 active:opacity-60 transition-all duration-150 ${
                menuOpen ? 'text-indigo-500' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
              title="Settings"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4 transition-transform duration-200"
                viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: menuOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            {/* Dropdown menu */}
            <DropdownMenu open={menuOpen} className="w-44">
              <button
                onClick={() => { setMenuOpen(false); setModal('drag'); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                拖拽设置
              </button>
              <button
                onClick={() => { setMenuOpen(false); setModal('sync'); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-t border-gray-100 dark:border-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                同步设置
              </button>
              <button
                onClick={() => { setMenuOpen(false); downloadLogs(); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-t border-gray-100 dark:border-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                下载日志
              </button>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Editor area */}
      <div className="relative flex-1 overflow-hidden">
        {modal === 'clear' && (
          <div className="absolute inset-0 z-10 bg-gray-500/20 dark:bg-gray-900/30 backdrop-blur-[2px] pointer-events-none" />
        )}
        {dragState?.active && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-50/50 dark:bg-blue-900/20 pointer-events-none">
            {/* Pulse rings */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-32 h-32 rounded-2xl border-2 border-blue-400/30 dark:border-blue-400/20" style={{ animation: 'dropPulse 1.5s ease-out infinite' }} />
              <div className="absolute w-32 h-32 rounded-2xl border-2 border-blue-400/30 dark:border-blue-400/20" style={{ animation: 'dropPulse 1.5s ease-out 0.5s infinite' }} />
            </div>
            {/* Document ghost */}
            <div className="relative flex flex-col items-center gap-3" style={{ animation: 'dropFloat 2s ease-in-out infinite' }}>
              <div className="w-28 h-36 rounded-lg border-2 border-dashed border-blue-400/60 dark:border-blue-400/40 bg-blue-100/40 dark:bg-blue-800/20 flex flex-col items-center justify-center gap-2">
                <DragTypeIcon type={dragState.type} />
                <span className="text-[10px] font-medium text-blue-500 dark:text-blue-300 uppercase tracking-wider">
                  {dragState.type}
                </span>
              </div>
              <span className="text-xs text-blue-500/80 dark:text-blue-300/60">Release to capture</span>
            </div>
          </div>
        )}

        <EditorMount rootRef={rootRef} loading={loading} onDragStateChange={onDragStateChange} />
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between h-8 px-4 text-[10px] text-gray-400 dark:text-gray-600 border-t border-gray-100 dark:border-gray-800 shrink-0">
        <span>{charCount} chars</span>
      </footer>

      {/* Modal overlay */}
      {modal === 'drag' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
          onClick={() => setModal(null)}
          style={{ animation: 'backdropIn 300ms ease forwards' }}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200/60 dark:border-gray-700/60 w-56 p-4"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'modalIn 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
          >
            <h3 className="text-sm font-medium mb-3 text-gray-700 dark:text-gray-200">拖拽设置</h3>
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-xs text-gray-600 dark:text-gray-300">包含日期</span>
              <input
                type="checkbox"
                checked={includeDate}
                onChange={(e) => toggleDate(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-xs text-gray-600 dark:text-gray-300">包含时间</span>
              <input
                type="checkbox"
                checked={includeTime}
                onChange={(e) => toggleTime(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-xs text-gray-600 dark:text-gray-300">包含来源</span>
              <input
                type="checkbox"
                checked={includeSource}
                onChange={(e) => toggleSource(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
            <button
              onClick={saveSettings}
              className="w-full mt-3 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {modal === 'sync' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
          onClick={() => setModal(null)}
          style={{ animation: 'backdropIn 300ms ease forwards' }}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200/60 dark:border-gray-700/60 w-72 p-4"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'modalIn 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
          >
            <h3 className="text-sm font-medium mb-3 text-gray-700 dark:text-gray-200">同步设置</h3>

            {/* Room Key */}
            <div className="mb-3">
              <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">Room Key</label>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 px-2 py-1.5 text-[11px] font-mono bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300 truncate select-all">
                  {syncConfig?.roomKey ?? '...'}
                </code>
                <button
                  onClick={async () => {
                    if (!syncConfig) return;
                    await navigator.clipboard.writeText(syncConfig.roomKey);
                    setSyncCopied(true);
                    setTimeout(() => setSyncCopied(false), 2000);
                  }}
                  className="p-1.5 text-gray-400 hover:text-indigo-500 active:scale-90 transition-all"
                  title="Copy"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  {syncCopied && <span className="sr-only">Copied!</span>}
                </button>
              </div>
              {syncCopied && <p className="text-[10px] text-green-500 mt-0.5">已复制</p>}
            </div>

            {/* Bind device */}
            <div className="mb-3">
              <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">绑定设备</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={bindInput}
                  onChange={(e) => setBindInput(e.target.value)}
                  placeholder="输入其他设备的 Room Key"
                  className="flex-1 px-2 py-1.5 text-[11px] bg-gray-100 dark:bg-gray-700 rounded border-none outline-none focus:ring-1 focus:ring-indigo-500 text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
                />
                <button
                  onClick={async () => {
                    if (!isValidRoomKey(bindInput) || !syncConfig) return;
                    const newConfig = { ...syncConfig, roomKey: bindInput };
                    await saveSyncConfig(newConfig);
                    setSyncConfig(newConfig);
                    setBindInput('');
                    log.info('Bound to room:', bindInput);
                  }}
                  disabled={!isValidRoomKey(bindInput)}
                  className="px-2.5 py-1.5 text-[11px] font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  绑定
                </button>
              </div>
            </div>

            {/* Server URL */}
            <div className="mb-3">
              <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">后端地址</label>
              <input
                type="text"
                value={serverInput || syncConfig?.serverUrl || ''}
                onChange={(e) => setServerInput(e.target.value)}
                onBlur={async () => {
                  if (!syncConfig || !serverInput) return;
                  const newConfig = { ...syncConfig, serverUrl: serverInput };
                  await saveSyncConfig(newConfig);
                  setSyncConfig(newConfig);
                  log.info('Server URL updated:', serverInput);
                }}
                placeholder={syncConfig?.serverUrl}
                className="w-full px-2 py-1.5 text-[11px] bg-gray-100 dark:bg-gray-700 rounded border-none outline-none focus:ring-1 focus:ring-indigo-500 text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
              />
            </div>

            {/* Sync status */}
            <div className="flex items-center gap-1.5 mb-3">
              <span className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'online' ? 'bg-green-500' : syncStatus === 'syncing' ? 'bg-yellow-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {syncStatus === 'online' ? '已连接' : syncStatus === 'syncing' ? '同步中' : '离线'}
              </span>
            </div>

            <button
              onClick={() => setModal(null)}
              className="w-full px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(scale * delta, 0.1), 10);

    // Zoom around mouse pointer
    const scaleRatio = newScale / scale;
    const newTx = mouseX - (mouseX - translate.x) * scaleRatio;
    const newTy = mouseY - (mouseY - translate.y) * scaleRatio;

    setScale(newScale);
    setTranslate({ x: newTx, y: newTy });
  }, [scale, translate]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
  }, [translate]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setTranslate({
      x: dragStart.current.tx + (e.clientX - dragStart.current.x),
      y: dragStart.current.ty + (e.clientY - dragStart.current.y),
    });
  }, [dragging]);

  const onMouseUp = useCallback(() => setDragging(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{
        animation: 'backdropIn 200ms ease forwards',
        cursor: dragging ? 'grabbing' : scale > 1 ? 'grab' : 'zoom-out',
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="rounded-lg shadow-2xl select-none"
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transition: dragging ? 'none' : 'transform 100ms ease-out',
          maxWidth: 'none',
          maxHeight: 'none',
          animation: 'modalIn 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs pointer-events-none select-none">
        Scroll to zoom · Drag to pan · Click outside to close
      </div>
    </div>
  );
}

function DropdownMenu({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      className={`absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-30 ${className ?? ''}`}
      style={{
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0) scaleY(1)' : 'translateY(-4px) scaleY(0.9)',
        transformOrigin: 'top right',
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 150ms, transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {children}
    </div>
  );
}

function EditorMount({
  rootRef,
  loading,
  onDragStateChange,
}: {
  rootRef: (el: HTMLDivElement | null) => void;
  loading: boolean;
  onDragStateChange: (state: { active: boolean; type?: 'text' | 'image' | 'link' | 'file' }) => void;
}) {
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      rootRef(el);
      if (el) {
        const onDragEnter = (e: DragEvent) => {
          if (e.dataTransfer?.types.length) {
            onDragStateChange({ active: true, type: detectDragType(e.dataTransfer) });
          }
        };
        const onDragLeave = (e: DragEvent) => {
          if (!el.contains(e.relatedTarget as Node)) onDragStateChange({ active: false });
        };
        const onDrop = () => onDragStateChange({ active: false });

        el.addEventListener('dragenter', onDragEnter);
        el.addEventListener('dragleave', onDragLeave);
        el.addEventListener('drop', onDrop);
      }
    },
    [rootRef, onDragStateChange],
  );

  return (
    <div ref={setRef} className="h-full p-6 overflow-y-auto milkdown-root">
      {loading && (
        <p className="text-gray-300 dark:text-gray-600 text-sm select-none">
          Loading editor...
        </p>
      )}
    </div>
  );
}
