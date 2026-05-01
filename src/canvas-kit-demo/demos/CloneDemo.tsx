import { useCallback, useEffect, useRef, useState } from 'react';
import { useCloneInteraction, cloneByAltDrag, screenToWorld } from '@/canvas-kit';
import type { InsertAdapter, Op, ClipboardSnapshot } from '@/canvas-kit';

interface Rect { id: string; x: number; y: number; width: number; height: number; color: string }

const W = 400, H = 300;

const INITIAL: Rect[] = [
  { id: 'a', x: 60,  y: 80,  width: 80, height: 60, color: '#7fb069' },
  { id: 'b', x: 220, y: 140, width: 80, height: 60, color: '#d4a574' },
];

interface OverlayItem { id: string; x: number; y: number }

export function CloneDemo() {
  const [rects, setRects] = useState<Rect[]>(INITIAL);
  const rectsRef = useRef(rects);
  rectsRef.current = rects;
  const nextId = useRef(0);

  const [overlay, setOverlay] = useState<OverlayItem[] | null>(null);

  // Clipboard items carry the full source rects. cloneByAltDrag's onEnd will
  // re-snapshot the selection and offset by the gesture's drag delta.
  const adapter: InsertAdapter<Rect> = {
    commitInsert: () => null,
    commitPaste: (clip: ClipboardSnapshot, offset) => {
      const items = clip.items as Rect[];
      return items.map((src) => ({
        ...src,
        id: `clone-${nextId.current++}`,
        x: src.x + offset.dx,
        y: src.y + offset.dy,
      }));
    },
    snapshotSelection: (ids: string[]): ClipboardSnapshot => ({
      items: ids
        .map((id) => rectsRef.current.find((r) => r.id === id))
        .filter((r): r is Rect => !!r),
    }),
    insertObject: (obj) => setRects((rs) => [...rs, obj]),
    setSelection: () => {},
    applyBatch: (ops: Op[]) => { for (const op of ops) op.apply(adapter); },
    getSelection: () => [],
  };

  const clone = useCloneInteraction<Rect>(adapter, {
    behaviors: [cloneByAltDrag()],
    setOverlay: (_layer, objects) => setOverlay(objects as OverlayItem[]),
    clearOverlay: () => setOverlay(null),
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragging = useRef(false);

  const hit = (wx: number, wy: number): Rect | null => {
    for (let i = rectsRef.current.length - 1; i >= 0; i--) {
      const r = rectsRef.current[i];
      if (wx >= r.x && wx <= r.x + r.width && wy >= r.y && wy <= r.y + r.height) return r;
    }
    return null;
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e.altKey) return;
    const cr = e.currentTarget.getBoundingClientRect();
    const [wx, wy] = screenToWorld(e.clientX - cr.left, e.clientY - cr.top, { panX: 0, panY: 0, zoom: 1 });
    const h = hit(wx, wy);
    if (!h) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    clone.start(wx, wy, [h.id], 'structures', { alt: true, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey });
  }, [clone]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const cr = e.currentTarget.getBoundingClientRect();
    const [wx, wy] = screenToWorld(e.clientX - cr.left, e.clientY - cr.top, { panX: 0, panY: 0, zoom: 1 });
    clone.move(wx, wy, { alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey });
  }, [clone]);

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    clone.end();
  }, [clone]);

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
      ctx.globalAlpha = 0.5;
      for (const item of overlay) {
        const src = rects.find((r) => r.id === item.id);
        if (!src) continue;
        ctx.fillStyle = src.color;
        ctx.fillRect(item.x, item.y, src.width, src.height);
      }
      ctx.globalAlpha = 1;
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

export const CLONE_DEMO_SOURCE = `const adapter: InsertAdapter<Rect> = {
  commitInsert: () => null,
  commitPaste: (clip, offset) => {
    const items = clip.items as Rect[];
    return items.map((src) => ({
      ...src,
      id: \`clone-\${nextId.current++}\`,
      x: src.x + offset.dx,
      y: src.y + offset.dy,
    }));
  },
  snapshotSelection: (ids) => ({
    items: ids
      .map((id) => rectsRef.current.find((r) => r.id === id))
      .filter((r): r is Rect => !!r),
  }),
  insertObject: (obj) => setRects((rs) => [...rs, obj]),
  setSelection: () => {},
  applyBatch: (ops) => { for (const op of ops) op.apply(adapter); },
  getSelection: () => [],
};

const clone = useCloneInteraction<Rect>(adapter, {
  behaviors: [cloneByAltDrag()],
  setOverlay: (_layer, objects) => setOverlay(objects as OverlayItem[]),
  clearOverlay: () => setOverlay(null),
});

// On Alt-pointer-down over a rect:
//   clone.start(worldX, worldY, [id], 'structures', { alt: true, ... })
// The cloneByAltDrag behavior gates activation on alt being held.
//
// On move: clone.move() — overlay is republished via setOverlay.
// On up:   clone.end() — behavior calls commitPaste with the drag offset
//          and emits InsertOps for each cloned object.
`;
