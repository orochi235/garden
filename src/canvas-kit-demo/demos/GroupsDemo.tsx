import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useMoveInteraction,
  useResizeInteraction,
  resolveToOutermostGroup,
  expandToLeaves,
  composeSelectionPose,
  createSelectionOverlayLayer,
  runLayers,
} from '@/canvas-kit';
import { clientToCanvas } from '../canvasCoords';
import type {
  Group,
  GroupAdapter,
  MoveAdapter,
  ResizeAdapter,
  ResizeAnchor,
  Op,
  RenderLayer,
} from '@/canvas-kit';

interface Rect { id: string; x: number; y: number; width: number; height: number; color: string }
interface Pose { x: number; y: number; width: number; height: number }

const W = 400, H = 300, HANDLE = 8;
const INITIAL_RECTS: Rect[] = [
  { id: 'a', x: 60,  y: 60,  width: 60, height: 50, color: '#7fb069' },
  { id: 'b', x: 140, y: 90,  width: 70, height: 60, color: '#7fb069' },
  { id: 'c', x: 100, y: 170, width: 80, height: 50, color: '#7fb069' },
  { id: 'd', x: 270, y: 130, width: 60, height: 60, color: '#d4a574' },
];
const INITIAL_GROUP: Group = { id: 'g1', members: ['a', 'b', 'c'] };

type Adapter = MoveAdapter<Rect, Pose> & ResizeAdapter<Rect, Pose> & GroupAdapter & {
  getSelection: () => string[];
  setSelection: (ids: string[]) => void;
};

export function GroupsDemo() {
  const [rects, setRects] = useState<Rect[]>(INITIAL_RECTS);
  const [groups, setGroups] = useState<Group[]>([INITIAL_GROUP]);
  const [selection, setSelection] = useState<string[]>([]);
  const rectsRef = useRef(rects); rectsRef.current = rects;
  const groupsRef = useRef(groups); groupsRef.current = groups;
  const selRef = useRef(selection); selRef.current = selection;

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
    applyBatch: (ops: Op[]) => { for (const op of ops) op.apply(adapter); },
    // GroupAdapter
    getGroup: (id) => groupsRef.current.find((g) => g.id === id),
    getGroupsForMember: (id) =>
      groupsRef.current.filter((g) => g.members.includes(id)).map((g) => g.id),
    insertGroup: (g) => setGroups((gs) => [...gs, g]),
    removeGroup: (id) => setGroups((gs) => gs.filter((g) => g.id !== id)),
    addToGroup: (gid, ids) =>
      setGroups((gs) => gs.map((g) => (g.id === gid ? { ...g, members: [...g.members, ...ids] } : g))),
    removeFromGroup: (gid, ids) =>
      setGroups((gs) => gs.map((g) => (g.id === gid ? { ...g, members: g.members.filter((m) => !ids.includes(m)) } : g))),
  };

  // Group-aware move: when a group id is in the dragged set, expand to leaves
  // so the kit translates each leaf by the same delta.
  const move = useMoveInteraction<Rect, Pose>(adapter, {
    translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
    expandIds: (ids) => expandToLeaves(ids, adapter),
  });
  // Group-aware resize: starting a resize against a group id triggers the
  // kit's union-AABB path. Each leaf is scaled proportionally on commit.
  const resize = useResizeInteraction<Rect, Pose>(adapter, {
    expandIds: (ids) => {
      const leaves = expandToLeaves(ids, adapter);
      // Single-leaf path expects expanded === [id]; only return leaves when
      // the input id was actually a group.
      if (ids.length === 1 && adapter.getGroup(ids[0]) === undefined) return ids;
      return leaves;
    },
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gesture = useRef<'move' | 'resize' | null>(null);

  // Compute group bounds for hit-testing the group's resize handles.
  const groupBounds = (groupId: string): Pose | null => {
    const leaves = expandToLeaves([groupId], adapter);
    if (leaves.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const lid of leaves) {
      const r = rectsRef.current.find((x) => x.id === lid);
      if (!r) continue;
      if (r.x < minX) minX = r.x;
      if (r.y < minY) minY = r.y;
      if (r.x + r.width > maxX) maxX = r.x + r.width;
      if (r.y + r.height > maxY) maxY = r.y + r.height;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  };

  const handlesOf = (p: Pose): { cx: number; cy: number; anchor: ResizeAnchor }[] => ([
    { cx: p.x,             cy: p.y,              anchor: { x: 'max', y: 'max' } },
    { cx: p.x + p.width,   cy: p.y,              anchor: { x: 'min', y: 'max' } },
    { cx: p.x,             cy: p.y + p.height,   anchor: { x: 'max', y: 'min' } },
    { cx: p.x + p.width,   cy: p.y + p.height,   anchor: { x: 'min', y: 'min' } },
  ]);

  const hit = (wx: number, wy: number): Rect | null => {
    for (let i = rectsRef.current.length - 1; i >= 0; i--) {
      const r = rectsRef.current[i];
      if (wx >= r.x && wx <= r.x + r.width && wy >= r.y && wy <= r.y + r.height) return r;
    }
    return null;
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const [wx, wy] = clientToCanvas(e.currentTarget, e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);

    // 1) resize handle on the currently-selected id (group or leaf)?
    for (const id of selRef.current) {
      const group = adapter.getGroup(id);
      const pose = group ? groupBounds(id) : adapter.getPose(id);
      if (!pose) continue;
      for (const h of handlesOf(pose)) {
        if (Math.abs(wx - h.cx) <= HANDLE && Math.abs(wy - h.cy) <= HANDLE) {
          gesture.current = 'resize';
          resize.start(id, h.anchor, wx, wy);
          return;
        }
      }
    }

    // 2) hit-test a leaf, then resolve to its outermost group (if any).
    const target = hit(wx, wy);
    if (!target) {
      setSelection([]);
      return;
    }
    const resolved = resolveToOutermostGroup(target.id, adapter);
    if (!selRef.current.includes(resolved)) setSelection([resolved]);
    gesture.current = 'move';
    // useMoveInteraction's expandIds will expand the group id to leaves.
    move.start({ ids: [resolved], worldX: wx, worldY: wy, clientX: e.clientX, clientY: e.clientY });
  }, [move, resize]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!gesture.current) return;
    if (e.buttons === 0) {
      const g = gesture.current;
      gesture.current = null;
      if (g === 'move') move.cancel();
      else if (g === 'resize') resize.cancel();
      return;
    }
    const [wx, wy] = clientToCanvas(e.currentTarget, e.clientX, e.clientY);
    const mods = { alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey };
    if (gesture.current === 'move') {
      move.move({ worldX: wx, worldY: wy, clientX: e.clientX, clientY: e.clientY, modifiers: mods });
    } else if (gesture.current === 'resize') {
      resize.move(wx, wy, mods);
    }
  }, [move, resize]);

  const onPointerUp = useCallback(() => {
    const g = gesture.current;
    gesture.current = null;
    if (g === 'move') move.end();
    else if (g === 'resize') resize.end();
  }, [move, resize]);

  const moveOv = move.overlay;
  const resizeOv = resize.overlay;
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    const byId = (id: string) => rects.find((r) => r.id === id);

    // Pose resolver: move overlay > resize overlay (with leaf poses) > stored.
    // groupAdapter is supplied so a group id resolves to the union AABB of leaves.
    const resolvePose = composeSelectionPose<Pose>({
      moveOverlay: moveOv,
      resizeOverlay: resizeOv,
      getStoredPose: (id) => {
        const r = byId(id)!;
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      },
      groupAdapter: adapter,
    });

    const baseLayer: RenderLayer<unknown> = {
      id: 'base', label: 'Base',
      draw: (cx) => {
        const hide = new Set(moveOv?.hideIds ?? []);
        for (const r of rects) {
          if (hide.has(r.id)) continue;
          // During a group resize, draw each leaf at its scaled overlay pose.
          const leafResize = resizeOv?.leafPoses?.get(r.id);
          const p = leafResize ?? r;
          cx.fillStyle = r.color;
          cx.fillRect(p.x, p.y, p.width, p.height);
        }
      },
    };

    const ghostLayer: RenderLayer<unknown> = {
      id: 'ghost', label: 'Ghost',
      draw: (cx) => {
        if (!moveOv) return;
        cx.globalAlpha = 0.85;
        for (const id of moveOv.draggedIds) {
          const p = moveOv.poses.get(id);
          const src = byId(id);
          if (!p || !src) continue;
          cx.fillStyle = src.color;
          cx.fillRect(p.x, p.y, p.width, p.height);
        }
        cx.globalAlpha = 1;
      },
    };

    // Selection overlay receives the same group adapter so a group selection
    // renders as one rectangle (the union AABB) with corner handles.
    const selectionLayer = createSelectionOverlayLayer<Pose>({
      getSelection: () => selection,
      getPose: (id) => (byId(id) ? resolvePose(id) : null),
      groupAdapter: adapter,
      handles: { size: HANDLE },
    });

    runLayers(ctx, [baseLayer, ghostLayer, selectionLayer], undefined, {});
  }, [rects, selection, moveOv, resizeOv]);

  return (
    <canvas
      ref={canvasRef} className="ckd-canvas" width={W} height={H}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
    />
  );
}

export const GROUPS_DEMO_SOURCE = `// A virtual group is just a record { id, members: string[] }. The group has
// no pose of its own — its bounds are the union of the members' poses.

const group: Group = { id: 'g1', members: ['a', 'b', 'c'] };

// The adapter implements GroupAdapter alongside the usual move/resize
// interfaces. resolveToOutermostGroup walks parent groups; expandToLeaves
// flattens a possibly-group id list into leaf ids.

const move = useMoveInteraction<Rect, Pose>(adapter, {
  translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
  expandIds: (ids) => expandToLeaves(ids, adapter),  // group id -> leaves
});

const resize = useResizeInteraction<Rect, Pose>(adapter, {
  expandIds: (ids) => {
    if (ids.length === 1 && adapter.getGroup(ids[0]) === undefined) return ids;
    return expandToLeaves(ids, adapter);
  },
});

// On pointer-down: hit-test a leaf, then promote to its outermost group so
// click-to-select grabs the whole group.
const target = hit(wx, wy);
const id = target ? resolveToOutermostGroup(target.id, adapter) : null;

// Pose composition + selection overlay both accept groupAdapter — a group
// id resolves to the union AABB of its transitive leaves.
const resolvePose = composeSelectionPose<Pose>({
  moveOverlay: move.overlay, resizeOverlay: resize.overlay,
  getStoredPose: (id) => byId(id),
  groupAdapter: adapter,
});
const selectionLayer = createSelectionOverlayLayer<Pose>({
  getSelection: () => selection,
  getPose: (id) => resolvePose(id),
  groupAdapter: adapter,
});
`;
