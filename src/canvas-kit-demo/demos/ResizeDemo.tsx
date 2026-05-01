import { useCallback, useEffect, useRef, useState } from 'react';
import { useResizeInteraction, screenToWorld } from '@/canvas-kit';
import type { ResizeAdapter, ResizeAnchor, Op } from '@/canvas-kit';

interface Rect { id: string; x: number; y: number; width: number; height: number; color: string }
interface Pose { x: number; y: number; width: number; height: number }

const W = 400, H = 300, HANDLE = 8;

export function ResizeDemo() {
  const [rect, setRect] = useState<Rect>({
    id: 'r', x: 100, y: 80, width: 180, height: 130, color: '#7fb069',
  });
  const rectRef = useRef(rect);
  rectRef.current = rect;

  const adapter: ResizeAdapter<Rect, Pose> = {
    getObject: (id) => (rectRef.current.id === id ? rectRef.current : undefined),
    getPose: () => {
      const r = rectRef.current;
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    setPose: (_id, pose) => setRect((r) => ({ ...r, ...pose })),
    applyBatch: (ops: Op[]) => { for (const op of ops) op.apply(adapter); },
  };

  const resize = useResizeInteraction<Rect, Pose>(adapter, {});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeAnchor = useRef<ResizeAnchor | null>(null);

  // Each handle is a (cx,cy,anchor)
  const handles = (r: Rect): { cx: number; cy: number; anchor: ResizeAnchor }[] => ([
    { cx: r.x,           cy: r.y,            anchor: { x: 'max', y: 'max' } },
    { cx: r.x + r.width, cy: r.y,            anchor: { x: 'min', y: 'max' } },
    { cx: r.x,           cy: r.y + r.height, anchor: { x: 'max', y: 'min' } },
    { cx: r.x + r.width, cy: r.y + r.height, anchor: { x: 'min', y: 'min' } },
  ]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const cr = e.currentTarget.getBoundingClientRect();
    const [wx, wy] = screenToWorld(e.clientX - cr.left, e.clientY - cr.top, { panX: 0, panY: 0, zoom: 1 });
    for (const h of handles(rectRef.current)) {
      if (Math.abs(wx - h.cx) <= HANDLE && Math.abs(wy - h.cy) <= HANDLE) {
        activeAnchor.current = h.anchor;
        e.currentTarget.setPointerCapture(e.pointerId);
        resize.start(rectRef.current.id, h.anchor, wx, wy);
        return;
      }
    }
  }, [resize]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeAnchor.current) return;
    const cr = e.currentTarget.getBoundingClientRect();
    const [wx, wy] = screenToWorld(e.clientX - cr.left, e.clientY - cr.top, { panX: 0, panY: 0, zoom: 1 });
    resize.move(wx, wy, { alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey });
  }, [resize]);

  const onPointerUp = useCallback(() => {
    if (!activeAnchor.current) return;
    activeAnchor.current = null;
    resize.end();
  }, [resize]);

  const overlay = resize.overlay;
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    // body — overlay's currentPose if active else stored pose
    const p = overlay?.currentPose ?? rect;
    ctx.fillStyle = rect.color;
    ctx.fillRect(p.x, p.y, p.width, p.height);

    // handles
    ctx.fillStyle = '#d4c4a8';
    ctx.strokeStyle = '#1a130d';
    ctx.lineWidth = 1;
    for (const h of handles({ ...rect, ...p })) {
      ctx.fillRect(h.cx - HANDLE / 2, h.cy - HANDLE / 2, HANDLE, HANDLE);
      ctx.strokeRect(h.cx - HANDLE / 2, h.cy - HANDLE / 2, HANDLE, HANDLE);
    }
  }, [rect, overlay]);

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

export const RESIZE_DEMO_SOURCE = `const adapter: ResizeAdapter<Rect, Pose> = {
  getObject: (id) => (rectRef.current.id === id ? rectRef.current : undefined),
  getPose: () => {
    const r = rectRef.current;
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  },
  setPose: (_id, pose) => setRect((r) => ({ ...r, ...pose })),
  applyBatch: (ops) => { for (const op of ops) op.apply(adapter); },
};

const resize = useResizeInteraction<Rect, Pose>(adapter, {});

// Each handle has a ResizeAnchor: { x: 'min'|'max'|'free', y: ... }.
// 'min' anchors the side where coords stay fixed; the opposite side moves.
// Top-left handle uses { x: 'max', y: 'max' } — bottom-right is the anchor.
//
// onPointerDown over a handle:
//   resize.start(id, anchor, worldX, worldY)
// onPointerMove:
//   resize.move(worldX, worldY, modifiers)
// onPointerUp:
//   resize.end()
//
// resize.overlay.currentPose is the smoothed live pose to draw during drag.
`;
