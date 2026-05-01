import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useMoveInteraction,
  useResizeInteraction,
  useInsertInteraction,
  useAreaSelectInteraction,
  screenToWorld,
} from '@/canvas-kit';
import { selectFromMarquee } from '@/canvas-kit/area-select';
import type {
  MoveAdapter,
  ResizeAdapter,
  InsertAdapter,
  AreaSelectAdapter,
  ResizeAnchor,
  Op,
  ClipboardSnapshot,
} from '@/canvas-kit';

interface Rect { id: string; x: number; y: number; width: number; height: number; color: string }
interface Pose { x: number; y: number; width: number; height: number }

const W = 400, H = 300, HANDLE = 8;
const COLORS = ['#7fb069', '#d4a574', '#a48bd4', '#d47a7a', '#7ab8d4'];
const INITIAL: Rect[] = [
  { id: 'a', x: 40, y: 50, width: 80, height: 60, color: '#7fb069' },
  { id: 'b', x: 200, y: 140, width: 90, height: 70, color: '#d4a574' },
];

type Mode = 'select' | 'insert';
type Adapter = MoveAdapter<Rect, Pose> & ResizeAdapter<Rect, Pose> & InsertAdapter<Rect> & AreaSelectAdapter;

export function ComposeDemo() {
  const [rects, setRects] = useState<Rect[]>(INITIAL);
  const [selection, setSelection] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('select');
  const rectsRef = useRef(rects); rectsRef.current = rects;
  const selRef = useRef(selection); selRef.current = selection;
  const nextId = useRef(1);

  const adapter: Adapter = {
    getObject: (id) => rectsRef.current.find((r) => r.id === id),
    getPose: (id) => {
      const r = rectsRef.current.find((x) => x.id === id)!;
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    getParent: () => null,
    setPose: (id, p) => setRects((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r))),
    setParent: () => {},
    getSelection: () => selRef.current,
    setSelection: (ids) => setSelection(ids),
    insertObject: (obj) => setRects((rs) => [...rs, obj]),
    commitInsert: (b) => ({
      id: `r${nextId.current++}`,
      x: b.x, y: b.y, width: b.width, height: b.height,
      color: COLORS[nextId.current % COLORS.length],
    }),
    commitPaste: () => [],
    snapshotSelection: (): ClipboardSnapshot => ({ items: [] }),
    hitTestArea: ({ x, y, width, height }) => rectsRef.current
      .filter((r) => r.x < x + width && r.x + r.width > x && r.y < y + height && r.y + r.height > y)
      .map((r) => r.id),
    applyOps: (ops: Op[]) => { for (const op of ops) op.apply(adapter); },
    applyBatch: (ops: Op[]) => { for (const op of ops) op.apply(adapter); },
  };

  const move = useMoveInteraction<Rect, Pose>(adapter, {
    translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
  });
  const resize = useResizeInteraction<Rect, Pose>(adapter, {});
  const insert = useInsertInteraction<Rect, Pose>(adapter, { minBounds: { width: 4, height: 4 } });
  const area = useAreaSelectInteraction(adapter, { behaviors: [selectFromMarquee()] });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gesture = useRef<'move' | 'resize' | 'insert' | 'area' | null>(null);

  const handlesOf = (r: Rect): { cx: number; cy: number; anchor: ResizeAnchor }[] => ([
    { cx: r.x,           cy: r.y,            anchor: { x: 'max', y: 'max' } },
    { cx: r.x + r.width, cy: r.y,            anchor: { x: 'min', y: 'max' } },
    { cx: r.x,           cy: r.y + r.height, anchor: { x: 'max', y: 'min' } },
    { cx: r.x + r.width, cy: r.y + r.height, anchor: { x: 'min', y: 'min' } },
  ]);

  const hit = (wx: number, wy: number): Rect | null => {
    for (let i = rectsRef.current.length - 1; i >= 0; i--) {
      const r = rectsRef.current[i];
      if (wx >= r.x && wx <= r.x + r.width && wy >= r.y && wy <= r.y + r.height) return r;
    }
    return null;
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const cr = e.currentTarget.getBoundingClientRect();
    const [wx, wy] = screenToWorld(e.clientX - cr.left, e.clientY - cr.top, { panX: 0, panY: 0, zoom: 1 });
    const mods = { alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey };
    e.currentTarget.setPointerCapture(e.pointerId);

    // 1) resize handle on selected rect?
    for (const id of selRef.current) {
      const r = rectsRef.current.find((x) => x.id === id);
      if (!r) continue;
      for (const h of handlesOf(r)) {
        if (Math.abs(wx - h.cx) <= HANDLE && Math.abs(wy - h.cy) <= HANDLE) {
          gesture.current = 'resize';
          resize.start(r.id, h.anchor, wx, wy);
          return;
        }
      }
    }
    // 2) hit on object?
    const target = hit(wx, wy);
    if (target) {
      const ids = selRef.current.includes(target.id) ? selRef.current : [target.id];
      if (!selRef.current.includes(target.id)) setSelection([target.id]);
      gesture.current = 'move';
      move.start({ ids, worldX: wx, worldY: wy, clientX: e.clientX, clientY: e.clientY });
      return;
    }
    // 3) empty space — insert mode draws, select mode marquees
    if (mode === 'insert') {
      gesture.current = 'insert';
      insert.start(wx, wy, mods);
    } else {
      gesture.current = 'area';
      area.start(wx, wy, mods);
    }
  }, [move, resize, insert, area, mode]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!gesture.current) return;
    if (e.buttons === 0) {
      const g = gesture.current;
      gesture.current = null;
      if (g === 'move') move.cancel();
      else if (g === 'resize') resize.cancel();
      else if (g === 'insert') insert.cancel();
      else if (g === 'area') area.cancel();
      return;
    }
    const cr = e.currentTarget.getBoundingClientRect();
    const [wx, wy] = screenToWorld(e.clientX - cr.left, e.clientY - cr.top, { panX: 0, panY: 0, zoom: 1 });
    const mods = { alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey };
    if (gesture.current === 'move') move.move({ worldX: wx, worldY: wy, clientX: e.clientX, clientY: e.clientY, modifiers: mods });
    else if (gesture.current === 'resize') resize.move(wx, wy, mods);
    else if (gesture.current === 'insert') insert.move(wx, wy, mods);
    else if (gesture.current === 'area') area.move(wx, wy, mods);
  }, [move, resize, insert, area]);

  const onPointerUp = useCallback(() => {
    const g = gesture.current;
    gesture.current = null;
    if (g === 'move') move.end();
    else if (g === 'resize') resize.end();
    else if (g === 'insert') insert.end();
    else if (g === 'area') area.end();
  }, [move, resize, insert, area]);

  const moveOv = move.overlay, resizeOv = resize.overlay, insOv = insert.overlay, areaOv = area.overlay;
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const hide = new Set(moveOv?.hideIds ?? []);
    for (const r of rects) {
      if (hide.has(r.id)) continue;
      const p = resizeOv && r.id === resizeOv.id ? resizeOv.currentPose : r;
      ctx.fillStyle = r.color;
      ctx.fillRect(p.x, p.y, p.width, p.height);
      if (selection.includes(r.id)) {
        ctx.strokeStyle = '#f0e0a8'; ctx.lineWidth = 2;
        ctx.strokeRect(p.x - 1, p.y - 1, p.width + 2, p.height + 2);
      }
    }
    if (moveOv) {
      for (const id of moveOv.draggedIds) {
        const p = moveOv.poses.get(id); const src = rects.find((r) => r.id === id);
        if (!p || !src) continue;
        ctx.fillStyle = src.color; ctx.globalAlpha = 0.85;
        ctx.fillRect(p.x, p.y, p.width, p.height); ctx.globalAlpha = 1;
      }
    }
    // resize handles only for selected rects
    ctx.fillStyle = '#d4c4a8'; ctx.strokeStyle = '#1a130d'; ctx.lineWidth = 1;
    for (const id of selection) {
      const r = rects.find((x) => x.id === id); if (!r) continue;
      const p = resizeOv && id === resizeOv.id ? resizeOv.currentPose : r;
      for (const h of handlesOf({ ...r, ...p })) {
        ctx.fillRect(h.cx - HANDLE / 2, h.cy - HANDLE / 2, HANDLE, HANDLE);
        ctx.strokeRect(h.cx - HANDLE / 2, h.cy - HANDLE / 2, HANDLE, HANDLE);
      }
    }
    if (insOv) {
      const x = Math.min(insOv.start.x, insOv.current.x), y = Math.min(insOv.start.y, insOv.current.y);
      const w = Math.abs(insOv.current.x - insOv.start.x), h = Math.abs(insOv.current.y - insOv.start.y);
      ctx.fillStyle = 'rgba(127,176,105,0.25)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#7fb069'; ctx.setLineDash([4, 4]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    }
    if (areaOv) {
      const x = Math.min(areaOv.start.worldX, areaOv.current.worldX), y = Math.min(areaOv.start.worldY, areaOv.current.worldY);
      const w = Math.abs(areaOv.current.worldX - areaOv.start.worldX), h = Math.abs(areaOv.current.worldY - areaOv.start.worldY);
      ctx.fillStyle = 'rgba(164,139,212,0.18)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#a48bd4'; ctx.setLineDash([3, 3]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    }
  }, [rects, selection, moveOv, resizeOv, insOv, areaOv]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['select', 'insert'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '4px 10px', fontSize: 12, cursor: 'pointer',
              background: mode === m ? '#7fb069' : '#2a2018',
              color: mode === m ? '#1a130d' : '#d4c4a8',
              border: '1px solid #4a3c2e', borderRadius: 3,
            }}
          >{m}</button>
        ))}
      </div>
      <canvas
        ref={canvasRef} className="ckd-canvas" width={W} height={H}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      />
    </div>
  );
}

export const COMPOSE_DEMO_SOURCE = `// One adapter implements MoveAdapter & ResizeAdapter & InsertAdapter & AreaSelectAdapter.
// Structural typing means each hook accepts the wider object.
const adapter: Adapter = { /* getObject, getPose, setPose, hitTestArea,
  commitInsert, getSelection, setSelection, applyOps, applyBatch, ... */ };

const move   = useMoveInteraction(adapter, { translatePose });
const resize = useResizeInteraction(adapter, {});
const insert = useInsertInteraction(adapter, { minBounds: { width: 4, height: 4 } });
const area   = useAreaSelectInteraction(adapter, { behaviors: [selectFromMarquee()] });

// Pointer-down dispatcher picks which hook gets the gesture:
function onPointerDown(e) {
  // 1. on a resize handle of a selected rect? -> resize
  for (const id of selection) for (const h of handlesOf(byId(id)))
    if (nearHandle(wx, wy, h)) return resize.start(id, h.anchor, wx, wy);

  // 2. on an object? -> move (and select it if not already)
  const target = hit(wx, wy);
  if (target) { selectIfNeeded(target.id); return move.start({ ids, worldX, worldY, ... }); }

  // 3. empty space: insert mode draws, otherwise marquee-selects
  return mode === 'insert' ? insert.start(wx, wy, mods) : area.start(wx, wy, mods);
}

// onPointerMove / onPointerUp route to whichever hook owns gesture.current.
// Selection lives on the adapter; the renderer reads it to decide which rects
// get a highlight outline and resize handles.
`;
