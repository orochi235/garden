import { useMemo, useRef, useState } from 'react';
import {
  defineTool,
  useMove,
  useResize,
  useAreaSelect,
  useClone,
  cloneByAltDrag,
  cornerResizeHandles,
  hitCornerHandle,
  selectFromMarquee,
  type Tool,
  type RenderLayer,
  type ResizeAnchor,
  type UseMoveOptions,
  type UseResizeOptions,
  type MoveBehavior,
  type InsertAdapter,
} from '@orochi235/weasel';
import { snapToGrid as moveSnapToGrid } from '@orochi235/weasel/move';
import { useUiStore } from '../../store/uiStore';
import { useGardenStore } from '../../store/gardenStore';
import { getCultivar } from '../../model/cultivars';
import { renderPlant } from '../plantRenderers';
import {
  type GardenSceneAdapter,
  type ScenePose,
  type SceneNode,
} from '../adapters/gardenScene';
import { createStructureResizeAdapter, type StructureResizePose } from '../adapters/structureResize';
import { createZoneResizeAdapter } from '../adapters/zoneResize';
import { expandToGroups } from '../../utils/groups';
import {
  clampStructureZoneToGardenBounds,
  detectStructureClash,
} from './structureMoveBehaviors';

export type SelectScratch =
  | { kind: 'idle' }
  | { kind: 'move'; ids: string[] }
  | { kind: 'clone'; ids: string[] }
  | { kind: 'resize'; targetId: string; layer: 'structures' | 'zones'; anchor: ResizeAnchor }
  | { kind: 'area' };

const HANDLE_HIT_RADIUS_PX = 8;

function getStructure(id: string) {
  return useGardenStore.getState().garden.structures.find((s) => s.id === id);
}
function getZone(id: string) {
  return useGardenStore.getState().garden.zones.find((z) => z.id === id);
}

/**
 * Mirror `findSnapTarget` into `ctx.snap` for the planting being dragged.
 * Lets `requirePlantingDrop` decide whether to cancel a free-space release.
 * Skips non-plantings (structures/zones move freely with no snap requirement).
 */
function trackPlantingSnap(adapter: GardenSceneAdapter): MoveBehavior<ScenePose> {
  return {
    onMove(ctx) {
      const obj = adapter.getObject(ctx.draggedIds[0]) as SceneNode | undefined;
      if (!obj || obj.kind !== 'planting') return;
      const t = adapter.findSnapTarget?.(ctx.draggedIds[0], ctx.pointer.worldX, ctx.pointer.worldY);
      return { snap: t ?? null };
    },
  };
}

/**
 * Grid-snap structure/zone moves to the garden's gridCellSizeFt. Plantings
 * skip this — their pose comes from the container's layout strategy, which
 * has its own slot-based snapping. The Alt key bypasses snap.
 */
function snapStructureZoneToGrid(adapter: GardenSceneAdapter): MoveBehavior<ScenePose> {
  return {
    onMove(ctx, proposed) {
      const obj = adapter.getObject(ctx.draggedIds[0]) as SceneNode | undefined;
      if (!obj || obj.kind === 'planting') return;
      // Re-read spacing each move; the garden grid cell size is editable.
      const inner = moveSnapToGrid<ScenePose>({
        spacing: useGardenStore.getState().garden.gridCellSizeFt,
        bypassKey: 'alt',
      });
      return inner.onMove?.(ctx, proposed);
    },
  };
}

/**
 * Snap-back: if a planting is released over no snap target, cancel the
 * gesture instead of letting `useMove` free-commit a transform op (which
 * would orphan the plant in nowhere-land).
 *
 * Why: legacy behavior reverted plant drops to origin when no container
 * accepted. The layout pass handles successful drops; this behavior gates
 * the "no container under pointer" case.
 */
function requirePlantingDrop(adapter: GardenSceneAdapter): MoveBehavior<ScenePose> {
  return {
    onEnd(ctx) {
      const obj = adapter.getObject(ctx.draggedIds[0]) as SceneNode | undefined;
      if (!obj || obj.kind !== 'planting') return;
      if (ctx.snap) return;
      return null;
    },
  };
}

interface CloneOverlayItem { id: string; x: number; y: number }

export function useEricSelectTool(
  adapter: GardenSceneAdapter,
  opts?: {
    moveOptions?: UseMoveOptions<ScenePose>;
    insertAdapter?: InsertAdapter<{ id: string }>;
    /**
     * When true, press-and-drag on an object body falls through to marquee
     * area-select instead of starting a move/clone. Click (no drag) on a body
     * is unchanged so users can still pick objects via single click. This
     * powers `viewMode === 'select-area'` from the ViewToolbar.
     */
    forceMarquee?: boolean;
    /** Distinct tool id (used when registering multiple variants). */
    toolId?: string;
  },
): Tool<SelectScratch> {
  const forceMarquee = opts?.forceMarquee ?? false;
  const moveBehaviors = useMemo<MoveBehavior<ScenePose>[]>(
    () => [
      snapStructureZoneToGrid(adapter),
      // Clamp before clash detection so the clash check sees the final pose.
      // Order matters: snap → clamp → clash; planting-only behaviors are
      // narrower (kind === 'planting') and don't interact with the above.
      clampStructureZoneToGardenBounds(adapter),
      detectStructureClash(adapter),
      trackPlantingSnap(adapter),
      requirePlantingDrop(adapter),
    ],
    [adapter],
  );
  const move = useMove<SceneNode, ScenePose>(adapter, {
    behaviors: moveBehaviors,
    ...(opts?.moveOptions ?? {}),
  });

  const structureResizeAdapter = useMemo(() => createStructureResizeAdapter(), []);
  const zoneResizeAdapter = useMemo(() => createZoneResizeAdapter(), []);
  const structureResizeOpts: UseResizeOptions<StructureResizePose> = {};
  const zoneResizeOpts: UseResizeOptions<StructureResizePose> = {};
  const structureResize = useResize(structureResizeAdapter, structureResizeOpts);
  const zoneResize = useResize(zoneResizeAdapter, zoneResizeOpts);

  const areaSelect = useAreaSelect(adapter, {
    behaviors: [selectFromMarquee()],
  });

  // Clone-on-alt-drag. Wires through the optional insertAdapter; if none is
  // provided (legacy callsites) the gesture silently no-ops.
  const [cloneOverlay, setCloneOverlay] = useState<CloneOverlayItem[]>([]);
  const cloneAdapter = opts?.insertAdapter;
  // useClone requires an adapter unconditionally; pass a stub when none is wired.
  const cloneStubAdapter = useMemo<InsertAdapter<{ id: string }>>(() => ({
    snapshotSelection: () => ({ items: [] }),
    commitInsert: () => null,
    commitPaste: () => [],
    getPasteOffset: () => ({ dx: 0, dy: 0 }),
    insertObject: () => {},
    setSelection: () => {},
    getSelection: () => [],
    applyBatch: () => {},
  }), []);
  const clone = useClone<{ id: string }>(cloneAdapter ?? cloneStubAdapter, {
    behaviors: [cloneByAltDrag()],
    setOverlay: (_layer, objects) => setCloneOverlay(objects as CloneOverlayItem[]),
    clearOverlay: () => setCloneOverlay([]),
  });

  // Stable ref to currently active resize so `drag.onEnd` can route correctly
  // even after scratch has been mutated by intervening events.
  const activeResize = useRef<'structures' | 'zones' | null>(null);

  const overlay = useMemo<RenderLayer<unknown>>(
    () => ({
      id: 'eric-select-overlay',
      label: 'Select Overlay (eric)',
      space: 'screen',
      draw(ctx, _data, view) {
        // Marquee rectangle.
        const aov = areaSelect.overlay;
        if (aov) {
          const x = Math.min(aov.start.worldX, aov.current.worldX);
          const y = Math.min(aov.start.worldY, aov.current.worldY);
          const w = Math.abs(aov.current.worldX - aov.start.worldX);
          const h = Math.abs(aov.current.worldY - aov.start.worldY);
          const sx = (x - view.x) * view.scale;
          const sy = (y - view.y) * view.scale;
          const sw = w * view.scale;
          const sh = h * view.scale;
          ctx.save();
          ctx.fillStyle = 'rgba(91, 164, 207, 0.15)';
          ctx.strokeStyle = '#5BA4CF';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.fillRect(sx, sy, sw, sh);
          ctx.strokeRect(sx, sy, sw, sh);
          ctx.setLineDash([]);
          ctx.restore();
        }

        // Drag ghosts: render translucent plant icons at the live overlay
        // poses. `useMove` doesn't write through to the store during a drag,
        // so the source planting stays put; this layer is the only visible
        // feedback that the drag is active.
        const mov = move.overlay;
        if (mov && mov.draggedIds.length > 0) {
          const garden = useGardenStore.getState().garden;

          // Snap-target highlight: if the layout pass has accepted a
          // destination container, outline it so the user can see where the
          // drop will land.
          if (mov.accepted && mov.destContainerId) {
            const c = garden.structures.find((s) => s.id === mov.destContainerId)
              ?? garden.zones.find((z) => z.id === mov.destContainerId);
            if (c) {
              const sx = (c.x - view.x) * view.scale;
              const sy = (c.y - view.y) * view.scale;
              const sw = c.width * view.scale;
              const sh = c.height * view.scale;
              ctx.save();
              ctx.strokeStyle = '#5BA4CF';
              ctx.lineWidth = 2;
              ctx.setLineDash([6, 4]);
              if ((c as { shape?: string }).shape === 'circle') {
                ctx.beginPath();
                ctx.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
                ctx.stroke();
              } else {
                ctx.strokeRect(sx, sy, sw, sh);
              }
              ctx.setLineDash([]);
              ctx.restore();
            }
          }

          for (const id of mov.draggedIds) {
            const pose = mov.poses.get(id);
            if (!pose) continue;
            const planting = garden.plantings.find((p) => p.id === id);
            if (!planting) continue;
            const cultivar = getCultivar(planting.cultivarId);
            if (!cultivar) continue;
            const footprintFt = cultivar.footprintFt ?? 0.5;
            const sx = (pose.x - view.x) * view.scale;
            const sy = (pose.y - view.y) * view.scale;
            const radiusPx = (footprintFt / 2) * view.scale;
            ctx.save();
            ctx.globalAlpha = 0.65;
            ctx.translate(sx, sy);
            renderPlant(ctx, planting.cultivarId, radiusPx, cultivar.color);
            ctx.restore();
          }
        }

        // Clone overlay: dashed dim ghosts of the selection at offset positions
        // while alt-drag is in flight. The originals stay rendered in their
        // normal layers, so this just draws the prospective copies.
        if (cloneOverlay.length > 0) {
          const garden = useGardenStore.getState().garden;
          for (const item of cloneOverlay) {
            const planting = garden.plantings.find((p) => p.id === item.id);
            if (!planting) continue;
            const cultivar = getCultivar(planting.cultivarId);
            if (!cultivar) continue;
            const footprintFt = cultivar.footprintFt ?? 0.5;
            const sx = (item.x - view.x) * view.scale;
            const sy = (item.y - view.y) * view.scale;
            const radiusPx = (footprintFt / 2) * view.scale;
            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.translate(sx, sy);
            renderPlant(ctx, planting.cultivarId, radiusPx, cultivar.color);
            ctx.restore();
          }
        }
      },
    }),
    [areaSelect, move, cloneOverlay],
  );

  return useMemo(
    () =>
      defineTool<SelectScratch>({
        id: opts?.toolId ?? 'eric-select',
        cursor: 'default',
        overlay,
        initScratch: () => ({ kind: 'idle' }),

        pointer: {
          onClick: (_e, ctx) => {
            // No-drag click: if scratch landed in 'area' (empty hit) and no
            // shift, clear selection. drag.onEnd only fires when a drag
            // actually started.
            if (ctx.scratch.kind === 'area' && !ctx.modifiers.shift) {
              useUiStore.getState().clearSelection();
            }
            ctx.scratch = { kind: 'idle' };
            return 'claim';
          },
          onDown: (e, ctx) => {
            if (e.button !== 0) return 'pass';

            // 1. Resize-handle hit (only when exactly one structure/zone is selected).
            //    Skipped in forceMarquee mode — handles aren't actionable when the
            //    drag will be reinterpreted as a marquee.
            const sel = useUiStore.getState().selectedIds;
            const radiusWorld = HANDLE_HIT_RADIUS_PX / Math.max(0.0001, ctx.view.scale);
            if (!forceMarquee && sel.length === 1) {
              const id = sel[0];
              const s = getStructure(id);
              if (s) {
                const bounds = { x: s.x, y: s.y, width: s.width, height: s.height };
                for (const h of cornerResizeHandles(bounds)) {
                  if (hitCornerHandle(h, ctx.worldX, ctx.worldY, radiusWorld)) {
                    ctx.scratch = { kind: 'resize', targetId: id, layer: 'structures', anchor: h.anchor };
                    return 'claim';
                  }
                }
              }
              const z = getZone(id);
              if (z) {
                const bounds = { x: z.x, y: z.y, width: z.width, height: z.height };
                for (const h of cornerResizeHandles(bounds)) {
                  if (hitCornerHandle(h, ctx.worldX, ctx.worldY, radiusWorld)) {
                    ctx.scratch = { kind: 'resize', targetId: id, layer: 'zones', anchor: h.anchor };
                    return 'claim';
                  }
                }
              }
            }

            // 2. Body hit → select + prepare move (or clone if alt-held & insert adapter present).
            //    In forceMarquee mode (viewMode === 'select-area'), skip the body branch
            //    entirely so a press-and-drag on an object draws a marquee instead.
            const hit = forceMarquee ? null : adapter.hitTest(ctx.worldX, ctx.worldY);
            if (hit) {
              const ui = useUiStore.getState();
              if (ctx.modifiers.shift) {
                if (!ui.selectedIds.includes(hit.id)) ui.addToSelection(hit.id);
              } else {
                if (!ui.selectedIds.includes(hit.id)) ui.select(hit.id);
              }
              const ids = useUiStore.getState().selectedIds;
              const baseIds = ids.length > 0 ? ids : [hit.id];
              // Expand grouped members so dragging one moves the group.
              // Selection in the UI store stays narrow so single-handle
              // resize affordance is preserved on the originally-clicked member.
              const structures = useGardenStore.getState().garden.structures;
              const dragIds = expandToGroups(baseIds, structures);
              const altClone = ctx.modifiers.alt && !!cloneAdapter;
              ctx.scratch = altClone
                ? { kind: 'clone', ids: dragIds }
                : { kind: 'move', ids: dragIds };
              return 'claim';
            }

            // 3. Empty → area select; clear selection on a click that doesn't
            //    grow into a drag (handled in onEnd when we observe no movement).
            ctx.scratch = { kind: 'area' };
            return 'claim';
          },
        },

        drag: {
          onStart: (e, ctx) => {
            const s = ctx.scratch;
            switch (s.kind) {
              case 'move':
                move.start({
                  ids: s.ids,
                  worldX: ctx.worldX,
                  worldY: ctx.worldY,
                  clientX: e.clientX,
                  clientY: e.clientY,
                });
                return 'claim';
              case 'clone':
                clone.start(ctx.worldX, ctx.worldY, s.ids, 'plantings', ctx.modifiers);
                return 'claim';
              case 'resize':
                if (s.layer === 'structures') {
                  structureResize.start(s.targetId, s.anchor, ctx.worldX, ctx.worldY);
                } else {
                  zoneResize.start(s.targetId, s.anchor, ctx.worldX, ctx.worldY);
                }
                activeResize.current = s.layer;
                return 'claim';
              case 'area':
                areaSelect.start(ctx.worldX, ctx.worldY, ctx.modifiers);
                return 'claim';
              default:
                return 'pass';
            }
          },

          onMove: (e, ctx) => {
            const s = ctx.scratch;
            switch (s.kind) {
              case 'move':
                move.move({
                  worldX: ctx.worldX,
                  worldY: ctx.worldY,
                  clientX: e.clientX,
                  clientY: e.clientY,
                  modifiers: ctx.modifiers,
                });
                return 'claim';
              case 'clone':
                clone.move(ctx.worldX, ctx.worldY, ctx.modifiers);
                return 'claim';
              case 'resize':
                if (activeResize.current === 'structures') structureResize.move(ctx.worldX, ctx.worldY, ctx.modifiers);
                else if (activeResize.current === 'zones') zoneResize.move(ctx.worldX, ctx.worldY, ctx.modifiers);
                return 'claim';
              case 'area':
                areaSelect.move(ctx.worldX, ctx.worldY, ctx.modifiers);
                return 'claim';
              default:
                return 'pass';
            }
          },

          onEnd: (_e, ctx) => {
            const s = ctx.scratch;
            switch (s.kind) {
              case 'move':
                move.end();
                return 'claim';
              case 'clone':
                clone.end();
                return 'claim';
              case 'resize':
                if (activeResize.current === 'structures') structureResize.end();
                else if (activeResize.current === 'zones') zoneResize.end();
                activeResize.current = null;
                return 'claim';
              case 'area': {
                const overlay = areaSelect.overlay;
                const dragged = overlay
                  && (Math.abs(overlay.current.worldX - overlay.start.worldX) > 0.0001
                    || Math.abs(overlay.current.worldY - overlay.start.worldY) > 0.0001);
                if (dragged) {
                  areaSelect.end();
                  // Expand marquee result so touching any member of a group
                  // selects all members.
                  const ui = useUiStore.getState();
                  const structures = useGardenStore.getState().garden.structures;
                  const expanded = expandToGroups(ui.selectedIds, structures);
                  if (expanded.length !== ui.selectedIds.length) {
                    ui.setSelection(expanded);
                  }
                } else {
                  areaSelect.cancel();
                  // Click-on-empty-with-no-drag: clear selection unless
                  // shift-extending (legacy parity).
                  if (!ctx.modifiers.shift) useUiStore.getState().clearSelection();
                }
                return 'claim';
              }
              default:
                return 'pass';
            }
          },

          onCancel: () => {
            move.cancel();
            clone.cancel();
            structureResize.cancel();
            zoneResize.cancel();
            areaSelect.cancel();
            activeResize.current = null;
            // Behaviors don't run onCancel, so clear the clash signal directly.
            if (useUiStore.getState().dragClashIds.length > 0) {
              useUiStore.getState().setDragClashIds([]);
            }
          },
        },

        keyboard: {
          onDown: (e, _ctx) => {
            if (e.key === 'Escape') {
              useUiStore.getState().clearSelection();
              return 'claim';
            }
            return 'pass';
          },
        },
      }),
    [adapter, move, clone, cloneAdapter, structureResize, zoneResize, areaSelect, overlay, forceMarquee, opts?.toolId],
  );
}
