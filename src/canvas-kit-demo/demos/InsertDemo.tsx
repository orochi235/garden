import { useCallback, useEffect, useRef, useState } from 'react';
import { useInsertInteraction, screenToWorld } from '@/canvas-kit';
import type { InsertAdapter, Op, ClipboardSnapshot } from '@/canvas-kit';

interface Rect { id: string; x: number; y: number; width: number; height: number; color: string }
interface Pose { x: number; y: number }

const W = 400, H = 300;
const COLORS = ['#7fb069', '#d4a574', '#a48bd4', '#d47a7a', '#7ab8d4'];

export function InsertDemo() {
  const [rects, setRects] = useState<Rect[]>([]);
  const rectsRef = useRef(rects);
  rectsRef.current = rects;
  const nextId = useRef(0);

  const adapter: InsertAdapter<Rect> = {
    commitInsert: (b) => ({
      id: `r${nextId.current++}`,
      x: b.x, y: b.y, width: b.width, height: b.height,
      color: COLORS[nextId.current % COLORS.length],
    }),
    commitPaste: () => [],
    snapshotSelection: (): ClipboardSnapshot => ({ items: [] }),
    insertObject: (obj) => setRects((rs) => [...rs, obj]),
    setSelection: () => {},
    applyBatch: (ops: Op[]) => { for (const op of ops) op.apply(adapter); },
  };

  const insert = useInsertInteraction<Rect, Pose>(adapter, {
    minBounds: { width: 4, height: 4 },
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const cr = e.currentTarget.getBoundingClientRect();
    const [wx, wy] = screenToWorld(e.clientX - cr.left, e.clientY - cr.top, { panX: 0, panY: 0, zoom: 1 });
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    insert.start(wx, wy, { alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey });
  }, [insert]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const cr = e.currentTarget.getBoundingClientRect();
    const [wx, wy] = screenToWorld(e.clientX - cr.left, e.clientY - cr.top, { panX: 0, panY: 0, zoom: 1 });
    insert.move(wx, wy, { alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey });
  }, [insert]);

  const onPointerUp = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    insert.end();
  }, [insert]);

  const overlay = insert.overlay;
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    for (const r of rects) {
      ctx.fillStyle = r.color;
      ctx.fillRect(r.x, r.y, r.width, r.height);
    }

    if (overlay) {
      const x = Math.min(overlay.start.x, overlay.current.x);
      const y = Math.min(overlay.start.y, overlay.current.y);
      const w = Math.abs(overlay.current.x - overlay.start.x);
      const h = Math.abs(overlay.current.y - overlay.start.y);
      ctx.fillStyle = 'rgba(127, 176, 105, 0.25)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#7fb069';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }, [rects, overlay]);

  return (
    <canvas
      ref={canvasRef}
      className="ckd-canvas"
      width={W}
      height={H}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}

export const INSERT_DEMO_SOURCE = `const adapter: InsertAdapter<Rect> = {
  commitInsert: (b) => ({
    id: \`r\${nextId.current++}\`,
    x: b.x, y: b.y, width: b.width, height: b.height,
    color: COLORS[nextId.current % COLORS.length],
  }),
  commitPaste: () => [],
  snapshotSelection: () => ({ items: [] }),
  insertObject: (obj) => setRects((rs) => [...rs, obj]),
  setSelection: () => {},
  applyBatch: (ops) => { for (const op of ops) op.apply(adapter); },
};

const insert = useInsertInteraction<Rect, Pose>(adapter, {
  minBounds: { width: 4, height: 4 },
});

// onPointerDown: insert.start(worldX, worldY, modifiers)
// onPointerMove: insert.move(worldX, worldY, modifiers)
// onPointerUp:   insert.end() — calls adapter.commitInsert(bounds),
//                wraps the new object in an InsertOp, applies the batch.
//
// insert.overlay.{ start, current } drives the rubber-band rect.
`;
