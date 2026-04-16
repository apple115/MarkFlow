import { useState, useCallback, useEffect, useRef } from 'react';
import { useMilkdown } from './useMilkdown';
import { downloadLogs, log } from './logger';
import { settings } from './settings';

export default function App() {
  const { rootRef, handle, loading } = useMilkdown();
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied'>('idle');
  const [charCount, setCharCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<'drag' | null>(null);
  const [includeTime, setIncludeTime] = useState(settings.includeTime);
  const [includeSource, setIncludeSource] = useState(settings.includeSource);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasContent = !loading && handle != null && !handle.isEmpty();

  const toggleTime = useCallback((v: boolean) => {
    setIncludeTime(v);
  }, []);

  const toggleSource = useCallback((v: boolean) => {
    setIncludeSource(v);
  }, []);

  const saveSettings = useCallback(() => {
    settings.includeTime = includeTime;
    settings.includeSource = includeSource;
    log.info('Settings saved:', { includeTime, includeSource });
    setModal(null);
  }, [includeTime, includeSource]);

  useEffect(() => {
    if (!handle) return;
    const id = setInterval(() => {
      setCharCount(handle.getMarkdown().length);
    }, 500);
    return () => clearInterval(id);
  }, [handle]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const handleCopy = useCallback(async () => {
    if (!handle) return;
    setStatus('copying');
    try {
      const md = handle.getMarkdown();
      await navigator.clipboard.writeText(md);
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
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

  const handleClear = useCallback(() => {
    if (!handle) return;
    handle.clear();
    setCharCount(0);
  }, [handle]);

  const onDragStateChange = useCallback((dragging: boolean) => {
    setIsDragging(dragging);
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
          {/* Clear */}
          <button
            onClick={handleClear}
            disabled={!hasContent}
            className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30
                       disabled:cursor-not-allowed active:scale-90 active:opacity-60
                       transition-all duration-150"
            title="Clear"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
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
            <div
              className="absolute top-full right-0 mt-1 w-44 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-30"
              style={{
                opacity: menuOpen ? 1 : 0,
                transform: menuOpen ? 'translateY(0) scaleY(1)' : 'translateY(-4px) scaleY(0.9)',
                transformOrigin: 'top right',
                pointerEvents: menuOpen ? 'auto' : 'none',
                transition: 'opacity 150ms, transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
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
            </div>
          </div>
        </div>
      </header>

      {/* Editor area */}
      <div className="relative flex-1 overflow-hidden">
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-50/60 dark:bg-blue-900/30 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-blue-600 dark:text-blue-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span className="text-sm font-medium">Drop to add</span>
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
      {modal && (
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
  onDragStateChange: (dragging: boolean) => void;
}) {
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      rootRef(el);
      if (el) {
        const onDragEnter = (e: DragEvent) => {
          if (e.dataTransfer?.types.length) onDragStateChange(true);
        };
        const onDragLeave = (e: DragEvent) => {
          if (!el.contains(e.relatedTarget as Node)) onDragStateChange(false);
        };
        const onDrop = () => onDragStateChange(false);

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
