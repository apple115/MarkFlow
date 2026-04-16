import { useState, useCallback } from 'react';
import { useMilkdown } from './useMilkdown';
import { downloadLogs } from './logger';

export default function App() {
  const { rootRef, handle, loading } = useMilkdown();
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied'>('idle');
  const [charCount, setCharCount] = useState(0);

  const hasContent = !loading && handle != null && !handle.isEmpty();

  // Update char count on content change
  const charCountInterval = useCallback(() => {
    if (!handle) return;
    const id = setInterval(() => {
      const md = handle.getMarkdown();
      setCharCount(md.length);
    }, 500);
    return () => clearInterval(id);
  }, [handle]);

  // Start polling when handle becomes available
  if (handle && !charCountInterval) {
    charCountInterval();
  }

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
      <header className="flex items-center justify-between h-12 px-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <span
          className={`w-2 h-2 rounded-full ${
            hasContent ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded-md
                       hover:bg-indigo-700 transition-colors"
          >
            {status === 'copied' ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={downloadLogs}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Download logs"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </button>
          <button
            onClick={handleClear}
            disabled={!hasContent}
            className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30
                       disabled:cursor-not-allowed transition-colors"
            title="Clear"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </header>

      {/* Editor area */}
      <div className="relative flex-1 overflow-hidden">
        {/* Drag overlay */}
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

        {/* Milkdown mount point — uses callback ref */}
        <EditorMount rootRef={rootRef} loading={loading} onDragStateChange={onDragStateChange} />
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between h-6 px-4 text-[10px] text-gray-400 dark:text-gray-600 border-t border-gray-100 dark:border-gray-800 shrink-0">
        <span>{charCount} chars</span>
        <span>Alt+S to toggle</span>
      </footer>
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
