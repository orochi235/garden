import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useMoveInteraction,
  snap,
  gridSnapStrategy,
} from '@/canvas-kit';
import { clientToCanvas } from '../canvasCoords';
import type { MoveAdapter } from '@/canvas-kit';
import type { Op } from '@/canvas-kit';

interface Rect { id: string; x: number; y: number; width: number; height: number; color: string }
interface Pose { x: number; y: number; width: number; height: number }

const W = 400, H = 300, CELL = 20;

const INITIAL: Rect[] = [
  { id: 'a', x: 40,  y: 40,  width: 60, height: 40, color: '#7fb069' },
  { id: 'b', x: 160, y: 100, width: 80, height: 60, color: '#d4a574' },
  { id: 'c', x: 260, y: 60,  width: 60, height: 60, color: '#a48bd4' },
];

export function MoveDemo() {
  const [rects, setRects] = useState<Rect[]>(INITIAL);
  const rectsRef = useRef(rects);
  rectsRef.current = rects;

  const adapter: MoveAdapter<Rect, Pose> = {
    getObject: (id) => rectsRef.current.find((r) => r.id === id),
    getPose: (id) => {
      const r = rectsRef.current.find((x) => x.id === id)!;
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    getParent: () => null,
    setPose: (id, pose) => {
      setRects((rs) => rs.map((r) => (r.id === id ? { ...r, ...pose } : r)));
    },
    setParent: () => {},
    applyBatch: (ops: Op[]) => {
      for (const op of ops) op.apply(adapter);
    },
  };

  const move = useMoveInteraction<Rect, Pose>(adapter, {
    translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
    behaviors: [snap(gridSnapStrategy<Pose>(CELL))],
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingId = useRef<string | null>(null);

  const hit = (wx: number, wy: number): Rect | null => {
    for (let i = rectsRef.current.length - 1; i >= 0; i--) {
      const r = rectsRef.current[i];
      if (wx >= r.x && wx <= r.x + r.width && wy >= r.y && wy <= r.y + r.height) return r;
    }
    return null;
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const [wx, wy] = clientToCanvas(e.currentTarget, e.clientX, e.clientY);
    const h = hit(wx, wy);
    if (!h) return;
    draggingId.current = h.id;
    e.currentTarget.setPointerCapture(e.pointerId);
    move.start({ ids: [h.id], worldX: wx, worldY: wy, clientX: e.clientX, clientY: e.clientY });
  }, [move]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingId.current) return;
    const [wx, wy] = clientToCanvas(e.currentTarget, e.clientX, e.clientY);
    move.move({ worldX: wx, worldY: wy, clientX: e.clientX, clientY: e.clientY,
      modifiers: { alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey } });
  }, [move]);

  const onPointerUp = useCallback(() => {
    if (!draggingId.current) return;
    draggingId.current = null;
    move.end();
  }, [move]);

  const overlay = move.overlay;
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    // grid
    ctx.strokeStyle = '#2a2018';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += CELL) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += CELL) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // rects (hide dragged ones; overlay draws them)
    const hide = new Set(overlay?.hideIds ?? []);
    for (const r of rects) {
      if (hide.has(r.id)) continue;
      ctx.fillStyle = r.color;
      ctx.fillRect(r.x, r.y, r.width, r.height);
    }
    // overlay (dragged with snap applied)
    if (overlay) {
      for (const id of overlay.draggedIds) {
        const p = overlay.poses.get(id);
        const src = rects.find((r) => r.id === id);
        if (!p || !src) continue;
        ctx.fillStyle = src.color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(p.x, p.y, p.width, p.height);
        ctx.globalAlpha = 1;
      }
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

export const MOVE_DEMO_SOURCE = `const adapter: MoveAdapter<Rect, Pose> = {
  getObject: (id) => rectsRef.current.find((r) => r.id === id),
  getPose: (id) => {
    const r = rectsRef.current.find((x) => x.id === id)!;
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  },
  getParent: () => null,
  setPose: (id, pose) =>
    setRects((rs) => rs.map((r) => (r.id === id ? { ...r, ...pose } : r))),
  setParent: () => {},
  applyBatch: (ops) => { for (const op of ops) op.apply(adapter); },
};

const move = useMoveInteraction<Rect, Pose>(adapter, {
  translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
  behaviors: [snap(gridSnapStrategy<Pose>(CELL))],
});

// Pointer wiring (abridged):
// onPointerDown: hit-test, then move.start({ ids, worldX, worldY, clientX, clientY })
// onPointerMove: move.move({ worldX, worldY, clientX, clientY, modifiers })
// onPointerUp:   move.end()
//
// Render: overlay = move.overlay carries the live (snapped) poses for
// dragged ids. Hide originals (overlay.hideIds) and draw poses on top.
`;
