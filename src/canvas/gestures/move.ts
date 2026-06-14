/**
 * Vendored `useMove` controller (pin copy).
 *
 * Imperative, behavior-composable move gesture eric drives from its own
 * `defineTool` `drag` handlers. HEAD removed this hook (replaced by the
 * dispatcher-driven `moveAction`); kit imports below are reconciled to HEAD's
 * still-public primitives. Gesture types use the vendored pin contract
 * (`MoveBehavior.onMove → { pose }`).
 */
import {
  createTransformOp,
  type DropTarget,
  dispatchApplyBatch,
  type LayoutStrategy,
  type MoveAdapter,
  type Op,
  type SnapTarget,
} from '@orochi235/weasel';
import { useCallback, useMemo, useRef, useState } from 'react';
import { translateRectPose } from './composePose';
import { useDragGesture } from './dragGesture';
import type { GestureContext, ModifierState, MoveBehavior, MoveOverlay } from './types';

/** Options for `useMove`. */
export interface UseMoveOptions<TPose> {
  translatePose?: (pose: TPose, dx: number, dy: number) => TPose;
  behaviors?: MoveBehavior<TPose>[];
  dragThresholdPx?: number;
  moveLabel?: string;
  transient?: boolean;
  onGestureStart?(ids: string[]): void;
  onGestureEnd?(committed: boolean): void;
  expandIds?: (ids: string[]) => string[];
  cascadeWorldPose?: (id: string) => TPose | null;
}

/** Arguments passed to `start()` when initiating a move gesture. */
export interface MoveStartArgs {
  ids: string[];
  worldX: number;
  worldY: number;
  clientX: number;
  clientY: number;
}

/** Arguments passed to `move()` on each pointer-move during a live gesture. */
export interface MoveMoveArgs {
  worldX: number;
  worldY: number;
  clientX: number;
  clientY: number;
  modifiers: ModifierState;
}

/** Return shape of `useMove`: lifecycle methods and a live overlay snapshot. */
export interface MoveController<TNode extends { id: string }, TPose> {
  start(args: MoveStartArgs): void;
  move(args: MoveMoveArgs): boolean;
  end(): void;
  cancel(): void;
  isActive(): boolean;
  overlay: MoveOverlay<TPose> | null;
  adapter: MoveAdapter<TNode, TPose>;
}

/** Pointer-driven move interaction with composable behaviors and op-batched commit. */
export function useMove<TNode extends { id: string }, TPose>(
  adapter: MoveAdapter<TNode, TPose>,
  options: UseMoveOptions<TPose> = {},
): MoveController<TNode, TPose> {
  const {
    translatePose = translateRectPose as unknown as (pose: TPose, dx: number, dy: number) => TPose,
    behaviors = [],
    dragThresholdPx = 4,
    moveLabel = 'Move',
    onGestureStart,
    onGestureEnd,
    expandIds,
    cascadeWorldPose,
  } = options;

  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const behaviorsRef = useRef(behaviors);
  behaviorsRef.current = behaviors;
  const translatePoseRef = useRef(translatePose);
  translatePoseRef.current = translatePose;
  const dragThresholdPxRef = useRef(dragThresholdPx);
  dragThresholdPxRef.current = dragThresholdPx;
  const moveLabelRef = useRef(moveLabel);
  moveLabelRef.current = moveLabel;
  const onGestureStartRef = useRef(onGestureStart);
  onGestureStartRef.current = onGestureStart;
  const onGestureEndRef = useRef(onGestureEnd);
  onGestureEndRef.current = onGestureEnd;
  const expandIdsRef = useRef(expandIds);
  expandIdsRef.current = expandIds;

  const effectiveCascade =
    cascadeWorldPose ??
    (adapter.getChildren
      ? (id: string) => {
          try {
            return adapter.getPose(id);
          } catch {
            return null;
          }
        }
      : undefined);
  const cascadeWorldPoseRef = useRef(effectiveCascade);
  cascadeWorldPoseRef.current = effectiveCascade;

  type Layout = LayoutStrategy<TPose>;
  type Target = DropTarget<TPose>;

  type LayoutPass = {
    destContainerId: string | null;
    accepted: boolean;
    layout: unknown;
    container: {
      id: string;
      bounds: { x: number; y: number; width: number; height: number };
    } | null;
    children: { id: string; pose: TPose }[];
    target: unknown;
    sourceReflowPositions: Map<string, TPose>;
  };
  const makeEmptyLayoutPass = (): LayoutPass => ({
    destContainerId: null,
    accepted: true,
    layout: null,
    container: null,
    children: [],
    target: null,
    sourceReflowPositions: new Map(),
  });

  interface MoveScratch {
    ids: string[];
    ctx: GestureContext<TPose, TNode> | null;
    cascadeIds: string[];
    cascadeOriginWorld: Map<string, TPose>;
    layoutPass: LayoutPass;
    startWorld: { x: number; y: number };
  }

  const [overlay, setOverlay] = useState<MoveOverlay<TPose> | null>(null);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;

  const pendingArgsRef = useRef<{ args: MoveStartArgs; expandedIds: string[] } | null>(null);

  const doMoveCompute = useCallback((scratch: MoveScratch, moveArgs: MoveMoveArgs) => {
    const ctx = scratch.ctx;
    if (!ctx) return;
    const adapter = adapterRef.current;
    const translatePose = translatePoseRef.current;

    ctx.modifiers = moveArgs.modifiers;
    ctx.pointer = {
      worldX: moveArgs.worldX,
      worldY: moveArgs.worldY,
      clientX: moveArgs.clientX,
      clientY: moveArgs.clientY,
    };

    const dx = moveArgs.worldX - scratch.startWorld.x;
    const dy = moveArgs.worldY - scratch.startWorld.y;

    const newPoses = new Map<string, TPose>();
    let snap: SnapTarget<TPose> | null = ctx.snap;

    for (const id of ctx.draggedIds) {
      const originPose = ctx.origin.get(id)!;
      let proposed = translatePose(originPose, dx, dy);
      if (id === ctx.draggedIds[0]) {
        for (const b of behaviorsRef.current) {
          const r = b.onMove?.(ctx, proposed);
          if (!r) continue;
          if (r.pose !== undefined) proposed = r.pose;
          if (r.snap !== undefined) snap = r.snap;
        }
      }
      newPoses.set(id, proposed);
    }

    ctx.current = newPoses;
    ctx.snap = snap;

    let overlayPoses = newPoses;
    let hideIds: string[] = ctx.draggedIds;
    if (scratch.cascadeIds.length > 0) {
      overlayPoses = new Map(newPoses);
      for (const id of scratch.cascadeIds) {
        const origin = scratch.cascadeOriginWorld.get(id)!;
        overlayPoses.set(id, translatePose(origin, dx, dy));
      }
      hideIds = [...ctx.draggedIds, ...scratch.cascadeIds];
    }

    // --- Layout pass (additive — runs only when adapter exposes getLayout) ---
    let hypotheticalChildPositions = new Map<string, TPose>();
    const sourceReflowPositions = new Map<string, TPose>();
    let destContainerId: string | null = null;
    let accepted = true;
    let dest: {
      id: string;
      bounds: { x: number; y: number; width: number; height: number };
      layout: Layout;
    } | null = null;
    let destLayout: Layout | null = null;
    let destChildren: { id: string; pose: TPose }[] = [];
    let destTarget: Target | null = null;

    const getLayout = (adapter as { getLayout?: (id: string) => unknown }).getLayout;
    if (typeof getLayout === 'function') {
      const draggedId = ctx.draggedIds[0];
      const draggedPose = newPoses.get(draggedId)!;
      const sourceContainerId = adapter.getParent?.(draggedId) ?? null;
      const draggedRect = draggedPose as unknown as {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      const draggedCenter = {
        x: draggedRect.x + (draggedRect.width ?? 0) / 2,
        y: draggedRect.y + (draggedRect.height ?? 0) / 2,
      };

      type Candidate = {
        id: string;
        bounds: { x: number; y: number; width: number; height: number };
        layout: Layout;
        zPath: number[];
        depth: number;
      };
      const candidates: Candidate[] = [];

      const getChildren = (adapter as { getChildren?: (id: string | null) => string[] })
        .getChildren;
      const testInside = (cPose: TPose, layout: Layout): boolean => {
        if (layout.contains) return layout.contains(cPose, draggedCenter);
        const b = cPose as unknown as { x: number; y: number; width: number; height: number };
        return (
          draggedCenter.x >= b.x &&
          draggedCenter.x < b.x + b.width &&
          draggedCenter.y >= b.y &&
          draggedCenter.y < b.y + b.height
        );
      };
      const considerCandidate = (id: string, zPath: number[]) => {
        if (id === draggedId) return;
        const layout = (getLayout as (id: string) => Layout | null).call(adapter, id);
        if (!layout) return;
        const cPose = adapter.getPose(id);
        if (!testInside(cPose, layout)) return;
        const bounds = cPose as unknown as { x: number; y: number; width: number; height: number };
        candidates.push({ id, bounds, layout, zPath, depth: zPath.length });
      };

      if (typeof getChildren === 'function') {
        const visited = new Set<string>();
        const walk = (parentId: string | null, parentPath: number[]) => {
          const childIds = getChildren.call(adapter, parentId) ?? [];
          for (let i = 0; i < childIds.length; i++) {
            const childId = childIds[i];
            if (visited.has(childId)) continue;
            visited.add(childId);
            const childPath = [...parentPath, i];
            considerCandidate(childId, childPath);
            walk(childId, childPath);
          }
        };
        walk(null, []);
        const objs = adapter.getNodes();
        let rootIdx = (getChildren.call(adapter, null) ?? []).length;
        for (const obj of objs) {
          if (visited.has(obj.id)) continue;
          if ((adapter.getParent?.(obj.id) ?? null) !== null) continue;
          const path = [rootIdx++];
          visited.add(obj.id);
          considerCandidate(obj.id, path);
          walk(obj.id, path);
        }
      } else {
        const objs = adapter.getNodes();
        for (let i = 0; i < objs.length; i++) {
          considerCandidate(objs[i].id, [i]);
        }
      }

      dest = null;
      for (const c of candidates) {
        if (dest === null) {
          dest = c;
          continue;
        }
        const cur = dest as Candidate;
        if (c.depth > cur.depth) {
          dest = c;
          continue;
        }
        if (c.depth < cur.depth) continue;
        let cAfter = false;
        for (let i = 0; i < c.zPath.length; i++) {
          if (c.zPath[i] > cur.zPath[i]) {
            cAfter = true;
            break;
          }
          if (c.zPath[i] < cur.zPath[i]) {
            cAfter = false;
            break;
          }
        }
        if (cAfter) dest = c;
      }

      if (dest) {
        const layout = dest.layout as Layout;
        const childIds = adapter.getChildren?.(dest.id) ?? [];
        const children = childIds
          .filter((cid) => cid !== draggedId || sourceContainerId === dest!.id)
          .map((cid) => ({ id: cid, pose: adapter.getPose(cid) }));
        const draggedArg = {
          id: draggedId,
          originPose: ctx.origin.get(draggedId)!,
          pose: draggedPose,
          sourceContainerId,
        };
        const targets = layout.getDropTargets(
          { id: dest.id, bounds: dest.bounds },
          children,
          draggedArg,
        );
        const target: Target | null = layout.snap.pickTarget(targets, {
          x: moveArgs.worldX,
          y: moveArgs.worldY,
        });
        if (target === null) {
          accepted = false;
        } else {
          destContainerId = dest.id;
          accepted = true;
          hypotheticalChildPositions = layout.reflowFor(
            { id: dest.id, bounds: dest.bounds },
            children,
            draggedArg,
            target,
          );
          if (sourceContainerId && sourceContainerId !== dest.id) {
            const srcLayout = (getLayout as (id: string) => unknown).call(
              adapter,
              sourceContainerId,
            ) as Layout | null;
            if (srcLayout) {
              const srcBounds = adapter.getPose(sourceContainerId) as unknown as {
                x: number;
                y: number;
                width: number;
                height: number;
              };
              const srcChildIds = adapter.getChildren?.(sourceContainerId) ?? [];
              const srcChildren = srcChildIds
                .filter((cid) => cid !== draggedId)
                .map((cid) => ({ id: cid, pose: adapter.getPose(cid) }));
              const reflowed = srcLayout.getChildPositions(
                { id: sourceContainerId, bounds: srcBounds },
                srcChildren,
              );
              for (const [cid, newPose] of reflowed) {
                const cur = adapter.getPose(cid) as unknown as Record<string, unknown>;
                const next = newPose as unknown as Record<string, unknown>;
                const same =
                  cur.x === next.x &&
                  cur.y === next.y &&
                  cur.width === next.width &&
                  cur.height === next.height;
                if (!same) sourceReflowPositions.set(cid, newPose);
              }
            }
          }
        }
        destLayout = layout;
        destChildren = children;
        destTarget = target;
      } else {
        accepted = false;
      }
    }

    scratch.layoutPass = {
      destContainerId,
      accepted,
      layout: dest ? destLayout : null,
      container: dest ? { id: dest.id, bounds: dest.bounds } : null,
      children: dest ? destChildren : [],
      target: destTarget,
      sourceReflowPositions,
    };

    setOverlay({
      draggedIds: ctx.draggedIds,
      poses: overlayPoses,
      snapped: snap,
      hideIds,
      hypotheticalChildPositions,
      sourceReflowPositions,
      destContainerId,
      accepted,
    });
  }, []);

  const gesture = useDragGesture<MoveScratch>({
    initScratch: () => {
      const args = pendingArgsRef.current!.args;
      return {
        ids: [],
        ctx: null,
        cascadeIds: [],
        cascadeOriginWorld: new Map(),
        layoutPass: makeEmptyLayoutPass(),
        startWorld: { x: args.worldX, y: args.worldY },
      };
    },
    thresholdReached: (ctx) => {
      const dxs = ctx.current.clientX - ctx.start.clientX;
      const dys = ctx.current.clientY - ctx.start.clientY;
      const t = dragThresholdPxRef.current;
      return !(dxs * dxs + dys * dys < t * t);
    },
    onStart: (ctx) => {
      const adapter = adapterRef.current;
      const cascadeWorldPose = cascadeWorldPoseRef.current;
      const pending = pendingArgsRef.current!;
      const args = pending.args;
      const ids = pending.expandedIds;
      ctx.scratch.ids = ids;
      const origin = new Map<string, TPose>();
      for (const id of ids) origin.set(id, adapter.getPose(id));
      const cascadeIds: string[] = [];
      const cascadeOriginWorld = new Map<string, TPose>();
      if (cascadeWorldPose && adapter.getChildren) {
        const draggedSet = new Set(ids);
        const visited = new Set<string>(ids);
        const queue: string[] = [...ids];
        while (queue.length > 0) {
          const next = queue.shift()!;
          const children = adapter.getChildren(next);
          if (!children) continue;
          for (const childId of children) {
            if (visited.has(childId)) continue;
            visited.add(childId);
            queue.push(childId);
            if (draggedSet.has(childId)) continue;
            const w = cascadeWorldPose(childId);
            if (w === null) continue;
            cascadeIds.push(childId);
            cascadeOriginWorld.set(childId, w);
          }
        }
      }
      ctx.scratch.ctx = {
        draggedIds: ids,
        origin,
        current: new Map(origin),
        snap: null,
        modifiers: { alt: false, shift: false, meta: false, ctrl: false },
        pointer: {
          worldX: args.worldX,
          worldY: args.worldY,
          clientX: args.clientX,
          clientY: args.clientY,
        },
        adapter,
        scratch: {},
      };
      ctx.scratch.cascadeIds = cascadeIds;
      ctx.scratch.cascadeOriginWorld = cascadeOriginWorld;
      ctx.scratch.layoutPass = makeEmptyLayoutPass();
      pendingArgsRef.current = null;
    },
    onActivate: (ctx) => {
      if (!ctx.scratch.ctx) return;
      onGestureStartRef.current?.(ctx.scratch.ctx.draggedIds);
      for (const b of behaviorsRef.current) b.onStart?.(ctx.scratch.ctx);
    },
    onMove: (ctx) => {
      if (!ctx.scratch.ctx) return;
      if (ctx.phase !== 'active') return;
      doMoveCompute(ctx.scratch, {
        worldX: ctx.current.worldX,
        worldY: ctx.current.worldY,
        clientX: ctx.current.clientX,
        clientY: ctx.current.clientY,
        modifiers: ctx.modifiers,
      });
    },
    onEnd: (ctx) => {
      const adapter = adapterRef.current;
      const moveLabel = moveLabelRef.current;
      if (!ctx.scratch.ctx || ctx.wasSubThreshold) {
        setOverlay(null);
        return false;
      }
      const moveCtx = ctx.scratch.ctx;
      let ops: Op[] | null | undefined;
      for (const b of behaviorsRef.current) {
        const r = b.onEnd?.(moveCtx);
        if (r === undefined) continue;
        ops = r;
        break;
      }
      if (ops === null) {
        setOverlay(null);
        return false;
      }
      const layoutPass = ctx.scratch.layoutPass;
      if (
        ops === undefined &&
        layoutPass.layout &&
        layoutPass.container &&
        moveCtx.draggedIds.length === 1
      ) {
        const layout = layoutPass.layout as Layout;
        const target = layoutPass.target as Target | null;
        const draggedId = moveCtx.draggedIds[0];
        const dropOps = layout.commitDrop(
          layoutPass.container,
          layoutPass.children,
          {
            id: draggedId,
            originPose: moveCtx.origin.get(draggedId)!,
            pose: moveCtx.current.get(draggedId)!,
            sourceContainerId: adapter.getParent?.(draggedId) ?? null,
          },
          layoutPass.accepted ? target : null,
        );
        const sourceReflowOps: Op[] = [];
        for (const [cid, newPose] of layoutPass.sourceReflowPositions) {
          sourceReflowOps.push(
            createTransformOp<TPose>({
              id: cid,
              from: adapter.getPose(cid),
              to: newPose,
              label: 'Source reflow',
            }),
          );
        }
        ops = [...dropOps, ...sourceReflowOps];
      }
      if (ops === undefined) {
        ops = moveCtx.draggedIds.map((id) =>
          createTransformOp<TPose>({
            id,
            from: moveCtx.origin.get(id)!,
            to: moveCtx.current.get(id)!,
            label: moveLabel,
          }),
        );
      }
      if (ops.length > 0) {
        dispatchApplyBatch(adapter, ops, ops[0].label ?? moveLabel);
      }
      setOverlay(null);
      return true;
    },
    onCancel: () => {
      setOverlay(null);
    },
    onGestureEnd: (committed) => {
      onGestureEndRef.current?.(committed);
    },
  });

  const start = useCallback(
    (args: MoveStartArgs) => {
      const expand = expandIdsRef.current;
      const expandedIds = expand ? expand(args.ids) : args.ids;
      if (expandedIds.length === 0) return;
      pendingArgsRef.current = { args, expandedIds };
      gesture.start(
        { worldX: args.worldX, worldY: args.worldY, clientX: args.clientX, clientY: args.clientY },
        { alt: false, shift: false, meta: false, ctrl: false },
      );
    },
    [gesture],
  );

  const move = useCallback(
    (args: MoveMoveArgs): boolean => {
      return gesture.move(
        { worldX: args.worldX, worldY: args.worldY, clientX: args.clientX, clientY: args.clientY },
        args.modifiers,
      );
    },
    [gesture],
  );

  const isActive = useCallback(() => gesture.phase === 'active', [gesture]);

  return useMemo<MoveController<TNode, TPose>>(
    () => ({
      start,
      move,
      end: gesture.end,
      cancel: gesture.cancel,
      isActive,
      get overlay() {
        return overlayRef.current;
      },
      get adapter() {
        return adapterRef.current;
      },
    }),
    [start, move, gesture.end, gesture.cancel, isActive],
  );
}
