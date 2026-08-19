/**
 * Webpage annotation overlay — low-latency pen/eraser scratch layer.
 *
 * Latency techniques (see APP-35 evaluation):
 * - Pointer Events with getCoalescedEvents() for full input sampling density
 * - getPredictedEvents() rendered on a separate overlay canvas (discarded on
 *   the next real event, per the W3C spec usage)
 * - desynchronized 2d context where supported (Chrome)
 * - Incremental quadratic-midpoint drawing only — never a full redraw per frame
 * - touch-action: none so the browser never hijacks the gesture for scrolling
 *
 * No persistence by design: annotations are ephemeral. Exit destroys the layer.
 */

import { browser } from 'wxt/browser';

type Tool = 'pen' | 'eraser';

interface Session {
  destroy: () => void;
}

let session: Session | null = null;

/** Toggle the annotation overlay on the current page. Returns whether it is now active. */
export function toggleAnnotation(): boolean {
  if (session) {
    session.destroy();
    session = null;
    notify(false);
    return false;
  }
  session = createSession();
  notify(true);
  return true;
}

/** Keep the sidepanel's annotate button in sync when the overlay is closed from the page. */
function notify(active: boolean) {
  browser.runtime
    .sendMessage({ type: 'annotation-state', active })
    .catch(() => {});
}

function createSession(): Session {
  const host = document.createElement('div');
  host.id = 'markflow-annotate-host';
  host.style.cssText =
    'position: fixed; inset: 0; z-index: 2147483646; width: 0; height: 0;';
  const shadow = host.attachShadow({ mode: 'open' });
  // Attach to <html> to escape any transformed ancestor on <body> that would
  // break position: fixed on the canvas.
  document.documentElement.appendChild(host);

  const style = document.createElement('style');
  style.textContent = `
    canvas.layer {
      position: fixed; inset: 0; width: 100vw; height: 100vh;
      touch-action: none; user-select: none; -webkit-user-select: none;
    }
    #base { cursor: crosshair; }
    #predict { pointer-events: none; }
    .toolbar {
      position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 6px;
      background: rgba(24, 24, 27, 0.92); backdrop-filter: blur(8px);
      border-radius: 12px; padding: 6px 10px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.35);
      font-family: system-ui, sans-serif; color: #e4e4e7;
      user-select: none; -webkit-user-select: none;
    }
    .toolbar button {
      display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; border: none; border-radius: 8px;
      background: transparent; color: #a1a1aa; cursor: pointer; padding: 0;
    }
    .toolbar button:hover { background: rgba(255,255,255,0.1); color: #fff; }
    .toolbar button.active { background: rgba(99,102,241,0.35); color: #fff; }
    .toolbar .dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid transparent; }
    .toolbar button.active .dot { border-color: #fff; }
    .toolbar input[type="range"] { width: 80px; accent-color: #818cf8; cursor: pointer; }
    .toolbar .sep { width: 1px; height: 18px; background: rgba(255,255,255,0.15); }
  `;
  shadow.appendChild(style);

  const dpr = window.devicePixelRatio || 1;

  const base = document.createElement('canvas');
  base.id = 'base';
  base.className = 'layer';
  const predict = document.createElement('canvas');
  predict.id = 'predict';
  predict.className = 'layer';

  const baseCtx = base.getContext('2d', { desynchronized: true } as CanvasRenderingContext2DSettings)!;
  const predictCtx = predict.getContext('2d', { desynchronized: true } as CanvasRenderingContext2DSettings)!;

  for (const ctx of [baseCtx, predictCtx]) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const [canvas, ctx] of [[base, baseCtx], [predict, predictCtx]] as const) {
      // Preserve existing ink across resizes by copying the bitmap over.
      const snapshot = document.createElement('canvas');
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      snapshot.getContext('2d')!.drawImage(canvas, 0, 0);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.drawImage(snapshot, 0, 0, snapshot.width / dpr, snapshot.height / dpr);
    }
  };
  resize();
  window.addEventListener('resize', resize);

  // --- State ---
  let tool: Tool = 'pen';
  let color = '#111111';
  let penWidth = 4;
  let drawing = false;
  let last: { x: number; y: number } | null = null;
  let lastMid: { x: number; y: number } | null = null;

  const inkWidth = () => (tool === 'eraser' ? penWidth * 4 : penWidth);

  const applyStrokeStyle = (ctx: CanvasRenderingContext2D) => {
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }
    ctx.lineWidth = inkWidth();
  };

  /** Draw one smoothed segment onto base, from lastMid through last → mid(p). */
  const drawSegment = (p: { x: number; y: number }, ctx: CanvasRenderingContext2D = baseCtx) => {
    if (!last || !lastMid) return;
    const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(lastMid.x, lastMid.y);
    ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
    ctx.stroke();
    return mid;
  };

  const getPoint = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });

  const coalesced = (e: PointerEvent): PointerEvent[] =>
    typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length > 0
      ? e.getCoalescedEvents()
      : [e];

  const predicted = (e: PointerEvent): PointerEvent[] =>
    typeof (e as any).getPredictedEvents === 'function'
      ? (e as any).getPredictedEvents()
      : [];

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drawing = true;
    base.setPointerCapture(e.pointerId);
    applyStrokeStyle(baseCtx);
    const p = getPoint(e);
    last = p;
    lastMid = p;
    // A dot for taps: draw a zero-length segment so a single tap leaves a mark.
    baseCtx.beginPath();
    baseCtx.arc(p.x, p.y, inkWidth() / 2, 0, Math.PI * 2);
    const fillOp = baseCtx.globalCompositeOperation;
    baseCtx.fillStyle = tool === 'eraser' ? 'rgba(0,0,0,1)' : color;
    baseCtx.fill();
    baseCtx.globalCompositeOperation = fillOp;
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drawing) return;
    applyStrokeStyle(baseCtx);
    for (const ev of coalesced(e)) {
      const mid = drawSegment(getPoint(ev));
      if (mid) lastMid = mid;
      last = getPoint(ev);
    }
    // Predicted points go on the disposable overlay: visual latency reduction
    // without committing guesses to the ink layer.
    predictCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    applyStrokeStyle(predictCtx);
    const savedLast = last;
    const savedMid = lastMid;
    for (const ev of predicted(e)) {
      const mid = drawSegment(getPoint(ev), predictCtx);
      if (mid) lastMid = mid;
      last = getPoint(ev);
    }
    last = savedLast;
    lastMid = savedMid;
    e.preventDefault();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!drawing) return;
    drawing = false;
    last = null;
    lastMid = null;
    predictCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (base.hasPointerCapture(e.pointerId)) base.releasePointerCapture(e.pointerId);
  };

  base.addEventListener('pointerdown', onPointerDown);
  base.addEventListener('pointermove', onPointerMove);
  base.addEventListener('pointerup', onPointerUp);
  base.addEventListener('pointercancel', onPointerUp);

  // --- Toolbar ---
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const penBlack = makeColorButton('#111111', '黑笔');
  const penRed = makeColorButton('#dc2626', '红笔');
  const eraserBtn = makeIconButton(
    '<path d="M16.5 3.5l4 4L8 20l-5 1 1-5L16.5 3.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    '橡皮',
  );
  const clearBtn = makeIconButton(
    '<polyline points="3 6 5 6 21 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    '清除全部',
  );
  const exitBtn = makeIconButton(
    '<line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    '退出批注 (Esc)',
  );

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '2';
  slider.max = '20';
  slider.value = String(penWidth);
  slider.title = '粗细';
  slider.addEventListener('input', () => {
    penWidth = Number(slider.value);
  });

  const refreshActive = () => {
    penBlack.classList.toggle('active', tool === 'pen' && color === '#111111');
    penRed.classList.toggle('active', tool === 'pen' && color === '#dc2626');
    eraserBtn.classList.toggle('active', tool === 'eraser');
  };

  const pickPen = (c: string) => {
    tool = 'pen';
    color = c;
    refreshActive();
  };
  penBlack.addEventListener('click', () => pickPen('#111111'));
  penRed.addEventListener('click', () => pickPen('#dc2626'));
  eraserBtn.addEventListener('click', () => {
    tool = 'eraser';
    refreshActive();
  });
  clearBtn.addEventListener('click', () => {
    baseCtx.save();
    baseCtx.setTransform(1, 0, 0, 1, 0, 0);
    baseCtx.clearRect(0, 0, base.width, base.height);
    baseCtx.restore();
  });
  exitBtn.addEventListener('click', () => toggleAnnotation());

  toolbar.append(penBlack, penRed, sep(), slider, sep(), eraserBtn, clearBtn, sep(), exitBtn);
  refreshActive();

  shadow.append(base, predict, toolbar);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') toggleAnnotation();
  };
  window.addEventListener('keydown', onKeyDown);

  return {
    destroy() {
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      host.remove();
    },
  };

  function makeColorButton(c: string, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.title = title;
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = c;
    btn.appendChild(dot);
    return btn;
  }

  function makeIconButton(svgInner: string, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.title = title;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">${svgInner}</svg>`;
    return btn;
  }

  function sep(): HTMLSpanElement {
    const s = document.createElement('span');
    s.className = 'sep';
    return s;
  }
}
