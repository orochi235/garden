import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useEscapeAction,
  useSelectAllAction,
  useDuplicateAction,
  useNudgeAction,
  createSelectionOverlayLayer,
  runLayers,
} from '@/canvas-kit';
import { clientToCanvas } from '../canvasCoords';
import type { Op, RenderLayer } from '@/canvas-kit';

interface Rect { id: string; x: number; y: number; width: number; height: number; color: string }
interface Pose { x: number; y: number; width: number; height: number }

const W = 400, H = 300;
const COLORS = ['#7fb069', '#d4a574', '#a48bd4', '#d47a7a', '#7ab8d4'];
const INITIAL: Rect[] = [
  { id: 'a', x: 50,  y: 60,  width: 70, height: 50, color: '#7fb069' },
  { id: 'b', x: 170, y: 90,  width: 80, height: 60, color: '#d4a574' },
  { id: 'c', x: 290, y: 160, width: 60, height: 50, color: '#a48bd4' },
];

export function ActionsDemo() {
  const [rects, setRects] = useState<Rect[]>(INITIAL);
  const [selection, setSelection] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const rectsRef = useRef(rects); rectsRef.current = rects;
  const selRef = useRef(selection); selRef.current = selection;
  const nextId = useRef(1);

  const adapter = {
    getSelection: () => selRef.current,
    setSelection,
    getPose: (id: string): Pose => {
      const r = rectsRef.current.find((x) => x.id === id)!;
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    setPose: (id: string, pose: Pose) =>
      setRects((rs) => rs.map((r) => (r.id === id ? { ...r, ...pose } : r))),
    listAll: () => rectsRef.current.map((r) => r.id),
    insertObject: (obj: Rect) => setRects((rs) => [...rs, obj]),
    removeObject: (id: string) => setRects((rs) => rs.filter((r) => r.id !== id)),
    cloneObject: (id: string, offset: { dx: number; dy: number }) => {
      const src = rectsRef.current.find((r) => r.id === id)!;
      return {
        id: `r${nextId.current++}`,
        x: src.x + offset.dx,
        y: src.y + offset.dy,
        width: src.width,
        height: src.height,
        color: COLORS[(nextId.current + 2) % COLORS.length],
      } as Rect;
    },
    applyBatch: (ops: Op[]) => { for (const op of ops) op.apply(adapter); },
  };

  // Only bind keyboard handlers when the canvas region is focused — keeps
  // multiple action demos from fighting over the same global keys.
  useEscapeAction(adapter, { enableKeyboard: focused });
  useSelectAllAction(adapter, { enableKeyboard: focused });
  useDuplicateAction<Pose>(adapter, { enableKeyboard: focused });
  useNudgeAction<Pose>(adapter, {
    enableKeyboard: focused,
    translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
    step: 2,
    shiftStep: 20,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const hit = (wx: number, wy: number): Rect | null => {
    for (let i = rectsRef.current.length - 1; i >= 0; i--) {
      const r = rectsRef.current[i];
      if (wx >= r.x && wx <= r.x + r.width && wy >= r.y && wy <= r.y + r.height) return r;
    }
    return null;
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const [wx, wy] = clientToCanvas(e.currentTarget, e.clientX, e.clientY);
    const target = hit(wx, wy);
    if (!target) {
      setSelection([]);
      return;
    }
    if (e.shiftKey) {
      setSelection((sel) =>
        sel.includes(target.id) ? sel.filter((x) => x !== target.id) : [...sel, target.id],
      );
    } else {
      setSelection([target.id]);
    }
  }, []);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    const baseLayer: RenderLayer<unknown> = {
      id: 'base', label: 'Base',
      draw: (cx) => {
        for (const r of rects) {
          cx.fillStyle = r.color;
          cx.fillRect(r.x, r.y, r.width, r.height);
        }
      },
    };

    const selectionLayer = createSelectionOverlayLayer<Pose>({
      getSelection: () => selection,
      getPose: (id) => {
        const r = rects.find((x) => x.id === id);
        return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
      },
    });

    runLayers(ctx, [baseLayer, selectionLayer], undefined, {});
  }, [rects, selection]);

  return (
    <div
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, outline: 'none' }}
    >
      <div style={{ fontSize: 11, color: focused ? '#7fb069' : '#7a6a52' }}>
        {focused
          ? 'Keys live: Esc / Cmd-A / Cmd-D / arrows (shift = bigger step)'
          : 'Click the canvas to enable keyboard shortcuts'}
      </div>
      <canvas
        ref={canvasRef} className="ckd-canvas" width={W} height={H}
        onPointerDown={(e) => { e.currentTarget.focus(); onPointerDown(e); }}
        tabIndex={-1}
      />
    </div>
  );
}

export const ACTIONS_DEMO_SOURCE = `// Four standalone "action" hooks bind their default keybindings on the
// document. Each hook takes a tiny adapter that knows how to read selection,
// look up poses, and apply an op batch — no gesture state, no overlays.

useEscapeAction(adapter);              // Esc      -> clear selection
useSelectAllAction(adapter);           // Cmd/Ctrl+A -> select all
useDuplicateAction<Pose>(adapter);     // Cmd/Ctrl+D -> clone selection
useNudgeAction<Pose>(adapter, {
  translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
  step: 2,        // arrow keys
  shiftStep: 20,  // shift + arrow keys
});

// All four ignore key events that originate inside inputs/textareas/
// contenteditables, and emit op batches via adapter.applyBatch — so they
// integrate with any history / undo stack the consumer wires up.
`;
