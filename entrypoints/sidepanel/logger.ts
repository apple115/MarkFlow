const MAX_BYTES = 100 * 1024; // 100KB ring buffer

const entries: string[] = [];
let totalBytes = 0;

function ts(): string {
  return new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
}

function push(level: string, ...args: unknown[]) {
  const msg = args
    .map((a) =>
      typeof a === 'string' ? a : JSON.stringify(a, null, 2),
    )
    .join(' ');
  const line = `[${ts()}] [${level}] ${msg}\n`;

  entries.push(line);
  totalBytes += line.length;

  // Trim oldest entries until under limit
  while (totalBytes > MAX_BYTES && entries.length > 1) {
    const removed = entries.shift()!;
    totalBytes -= removed.length;
  }
}

export const log = {
  info: (...args: unknown[]) => {
    console.log('[MarkFlow]', ...args);
    push('INFO', ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn('[MarkFlow]', ...args);
    push('WARN', ...args);
  },
  error: (...args: unknown[]) => {
    console.error('[MarkFlow]', ...args);
    push('ERROR', ...args);
  },
};

/** Download all buffered logs as a .txt file */
export function downloadLogs() {
  const header = `MarkFlow Log — ${new Date().toISOString()}\n${'='.repeat(50)}\n\n`;
  const content = header + entries.join('');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `markflow-log-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
