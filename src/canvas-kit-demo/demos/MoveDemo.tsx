import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useMoveInteraction,
  snap,
  gridSnapStrategy,
  createGridLayer,
  runLayers,
} from '@/canvas-kit';
import { clientToCanvas } from '../canvasCoords';
import type { MoveAdapter, RenderLayer, UnitRegistry } from '@/canvas-kit';
import type { Op } from '@/canvas-kit';

interface Rect { id: string; x: number; y: number; width: number; height: number; color: string }
interface Pose { x: number; y: number; width: number; height: number }

const W = 400, H = 300;
// Demo registry: base is the pixel, but the demo speaks in "tiles" worth 20px.
// Passing { value: 1, unit: 'tile' } at API boundaries resolves to 20 internally.
const REGISTRY: UnitRegistry = { base: 'px', units: { px: 1, tile: 20 } };
const CELL = { value: 1, unit: 'tile' } as const;

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
    behaviors: [snap(gridSnapStrategy<Pose>(CELL, REGISTRY))],
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

    const gridLayer = createGridLayer({
      cell: CELL,
      registry: REGISTRY,
      bounds: () => ({ x: 0, y: 0, width: W, height: H }),
      accentEvery: 5,
    });

    const baseLayer: RenderLayer<unknown> = {
      id: 'base', label: 'Base',
      draw: (cx) => {
        const hide = new Set(overlay?.hideIds ?? []);
        for (const r of rects) {
          if (hide.has(r.id)) continue;
          cx.fillStyle = r.color;
          cx.fillRect(r.x, r.y, r.width, r.height);
        }
      },
    };

    const ghostLayer: RenderLayer<unknown> = {
      id: 'ghost', label: 'Ghost',
      draw: (cx) => {
        if (!overlay) return;
        cx.globalAlpha = 0.85;
        for (const id of overlay.draggedIds) {
          const p = overlay.poses.get(id);
          const src = rects.find((r) => r.id === id);
          if (!p || !src) continue;
          cx.fillStyle = src.color;
          cx.fillRect(p.x, p.y, p.width, p.height);
        }
        cx.globalAlpha = 1;
      },
    };

    runLayers(ctx, [gridLayer, baseLayer, ghostLayer], undefined, {});
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

// Custom unit registry: base is 'px' but APIs can speak in 'tile' (= 20px).
// Bare numbers are still accepted everywhere — they're treated as base units.
const REGISTRY: UnitRegistry = { base: 'px', units: { px: 1, tile: 20 } };
const CELL = { value: 1, unit: 'tile' } as const;

const move = useMoveInteraction<Rect, Pose>(adapter, {
  translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
  behaviors: [snap(gridSnapStrategy<Pose>(CELL, REGISTRY))],
});

// Pointer wiring (abridged):
// onPointerDown: hit-test, then move.start({ ids, worldX, worldY, clientX, clientY })
// onPointerMove: move.move({ worldX, worldY, clientX, clientY, modifiers })
// onPointerUp:   move.end()
//
// Render: compose layers with runLayers. createGridLayer draws the
// background grid; the base layer draws committed rects (hiding overlay.hideIds);
// a ghost layer draws the live snapped poses on top.
const gridLayer = createGridLayer({
  cell: CELL,
  registry: REGISTRY,
  bounds: () => ({ x: 0, y: 0, width: W, height: H }),
  accentEvery: 5,
});
runLayers(ctx, [gridLayer, baseLayer, ghostLayer], undefined, {});
`;
