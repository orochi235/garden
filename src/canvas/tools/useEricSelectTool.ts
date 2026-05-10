import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useUiStore } from '../../store/uiStore';
import { useGardenStore } from '../../store/gardenStore';
import { getCultivar } from '../../model/cultivars';
import { plantingWorldPose } from '../../utils/plantingPose';
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
import {
  snapStructureZoneToGrid,
  requirePlantingDrop,
} from './snapMoveBehaviors';
import { MOVE_DRAG_KIND, type MovePutative } from '../drag/moveDrag';
import { RESIZE_DRAG_KIND, type ResizePutative } from '../drag/resizeDrag';
import { AREA_SELECT_DRAG_KIND, type AreaSelectPutative } from '../drag/areaSelectDrag';

export type SelectScratch =
  | { kind: 'idle' }
  | { kind: 'move'; ids: string[] }
  | { kind: 'clone'; ids: string[] }
  | { kind: 'resize'; targetId: string; layer: 'structures' | 'zones'; anchor: ResizeAnchor }
  | { kind: 'area' };

const HANDLE_HIT_RADIUS_PX = 8;
/** Pixel tolerance for hitting the implicit-outline edge of a group sibling. */
const OUTLINE_EDGE_HIT_PX = 6;

function getStructure(id: string) {
  return useGardenStore.getState().garden.structures.find((s) => s.id === id);
}
function getZone(id: string) {
  return useGardenStore.getState().garden.zones.find((z) => z.id === id);
}

/**
 * True if (worldX, worldY) lies on the rectangular AABB edge of `obj` within
 * `tolWorld` units, but NOT inside the body (the body is the responsibility
 * of `adapter.hitTest`). Used for "click the implicit group-sibling outline
 * to promote selection to the whole group" — see Phase 5 group-outline TODO.
 *
 * Circle-shaped structures: tested as the elliptical band of half-width
 * tolWorld around the perimeter.
 */
function hitOutlineEdge(
  obj: { x: number; y: number; width: number; length: number; shape?: string },
  worldX: number,
  worldY: number,
  tolWorld: number,
): boolean {
  if (obj.shape === 'circle') {
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.length / 2;
    const rx = obj.width / 2;
    const ry = obj.length / 2;
    if (rx <= 0 || ry <= 0) return false;
    // Normalized distance from center; |d-1| ~ tol/r at the perimeter.
    const dx = (worldX - cx) / rx;
    const dy = (worldY - cy) / ry;
    const d = Math.hypot(dx, dy);
    const meanR = (rx + ry) / 2;
    const tolNorm = tolWorld / Math.max(0.0001, meanR);
    // Edge band: outside-or-on perimeter within tolerance, OR just inside
    // perimeter within tolerance. We want only the outline ring; exclude
    // strictly-inside (body) by requiring d >= 1 - tolNorm AND d <= 1 + tolNorm
    // AND not "deep inside" — the d >= 1 - tolNorm half handles that.
    if (d >= 1 - tolNorm && d <= 1 + tolNorm) {
      // Reject strictly inside (body) — only the outer half of the band.
      // Body click would have been caught by adapter.hitTest and never reach
      // here, but guard anyway for shapes adapter.hitTest doesn't claim.
      return d >= 1 - tolNorm * 0.25;
    }
    return false;
  }
  // Rectangle: AABB
  const minX = obj.x;
  const minY = obj.y;
  const maxX = obj.x + obj.width;
  const maxY = obj.y + obj.length;
  // Outside the outer band? miss.
  if (worldX < minX - tolWorld || worldX > maxX + tolWorld) return false;
  if (worldY < minY - tolWorld || worldY > maxY + tolWorld) return false;
  // Inside the body (strictly inside, beyond inner tolerance)? not the edge.
  const insideBody =
    worldX > minX + tolWorld &&
    worldX < maxX - tolWorld &&
    worldY > minY + tolWorld &&
    worldY < maxY - tolWorld;
  return !insideBody;
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

// `snapStructureZoneToGrid` and `requirePlantingDrop` moved to
// `./snapMoveBehaviors.ts` so the eric → weasel behavior mapping
// (`snapToGrid`, `snapToContainer`, `snapBackOrDelete`) lives in one place.
// `trackPlantingSnap` stays here — it's the eric-specific equivalent of
// `snapToContainer` (mirrors `findSnapTarget` into `ctx.snap`) but does not
// override pose, because the live drag visual is owned by the layout
// strategy (`getLayout()` on the adapter).

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
  // NOTE (multi-select group-drag, weasel limitation):
  // weasel's `useMove` invokes `MoveBehavior.onMove` only on the primary id;
  // secondaries inherit the primary's delta. Today's clamp/clash behaviors
  // (`clampStructureZoneToGardenBounds`, `detectStructureClash`) compensate
  // by computing the union AABB and per-secondary rects from
  // `ctx.origin + (proposed.primary - origin.primary)`. That works for
  // shared-delta translation but cannot express per-id transforms (e.g.
  // per-member snap). A proper fix is a kit-side `behavior.onMoveAll(ctx)`
  // hook that addresses every dragged id directly. Tracked in
  // `docs/canvas-kit/TODO.md` (Tier 1.5).
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

  // Mirror weasel's live `move.overlay` into the framework's `dragPreview`
  // slot. The generic `dragPreviewLayer` then renders the move ghost via
  // `moveDrag.renderPreview` — this replaces the previous per-id ghost block
  // that lived in `eric-select-overlay`. See `src/canvas/drag/moveDrag.ts`
  // for the rationale (Option A façade over `useMove`).
  //
  // The publish is pure-render: no commit happens here. Commit still flows
  // through `move.end()` in `drag.onEnd`, which invokes `dispatchApplyBatch`
  // → `adapter.applyBatch` → `gardenStore.checkpoint()` + ops as a single
  // undo step.
  const moveOverlay = move.overlay;
  useEffect(() => {
    const ui = useUiStore.getState();
    if (!moveOverlay || moveOverlay.draggedIds.length === 0) {
      if (ui.dragPreview && ui.dragPreview.kind === MOVE_DRAG_KIND) {
        ui.setDragPreview(null);
      }
      return;
    }
    const putative: MovePutative = {
      draggedIds: moveOverlay.draggedIds,
      posesById: moveOverlay.draggedIds
        .map((id) => {
          const p = moveOverlay.poses.get(id);
          return p ? ([id, { x: p.x, y: p.y }] as [string, { x: number; y: number }]) : null;
        })
        .filter((e): e is [string, { x: number; y: number }] => e !== null),
      destContainerId: moveOverlay.destContainerId,
      accepted: moveOverlay.accepted,
    };
    ui.setDragPreview({ kind: MOVE_DRAG_KIND, putative });
  }, [moveOverlay]);

  const structureResizeAdapter = useMemo(() => createStructureResizeAdapter(), []);
  const zoneResizeAdapter = useMemo(() => createZoneResizeAdapter(), []);
  const structureResizeOpts: UseResizeOptions<StructureResizePose> = {};
  const zoneResizeOpts: UseResizeOptions<StructureResizePose> = {};
  const structureResize = useResize(structureResizeAdapter, structureResizeOpts);
  const zoneResize = useResize(zoneResizeAdapter, zoneResizeOpts);

  // Mirror weasel's live resize overlays into `uiStore.dragPreview` so the
  // framework's generic `dragPreviewLayer` renders the resize ghost via
  // `resizeDrag.renderPreview`. Same pattern as the move mirror above.
  // Commit still flows through `*Resize.end()` in `drag.onEnd`, which calls
  // `adapter.applyBatch` → `gardenStore.checkpoint()` (one undo step).
  const structureResizeOverlay = structureResize.overlay;
  const zoneResizeOverlay = zoneResize.overlay;
  useEffect(() => {
    const ui = useUiStore.getState();
    const ov = structureResizeOverlay ?? zoneResizeOverlay;
    const layer: 'structures' | 'zones' | null = structureResizeOverlay
      ? 'structures'
      : zoneResizeOverlay
        ? 'zones'
        : null;
    if (!ov || !layer) {
      if (ui.dragPreview && ui.dragPreview.kind === RESIZE_DRAG_KIND) {
        ui.setDragPreview(null);
      }
      return;
    }
    const p = ov.targetPose as { x: number; y: number; width: number; length?: number; height?: number };
    const putative: ResizePutative = {
      targetId: ov.id,
      layer,
      pose: {
        x: p.x,
        y: p.y,
        width: p.width,
        length: p.length ?? p.height ?? 0,
      },
    };
    ui.setDragPreview({ kind: RESIZE_DRAG_KIND, putative });
  }, [structureResizeOverlay, zoneResizeOverlay]);

  const areaSelect = useAreaSelect(adapter, {
    behaviors: [selectFromMarquee()],
  });

  // Mirror weasel's live `areaSelect.overlay` into `uiStore.dragPreview` so
  // the framework's generic `dragPreviewLayer` renders the marquee via
  // `areaSelectDrag.renderPreview`. Same façade pattern as the move/resize
  // mirrors above. The selection commit still flows through `areaSelect.end()`
  // in `drag.onEnd`, which runs the `selectFromMarquee` behavior; selection
  // is not part of the garden undo stack.
  const areaSelectOverlay = areaSelect.overlay;
  useEffect(() => {
    const ui = useUiStore.getState();
    if (!areaSelectOverlay) {
      if (ui.dragPreview && ui.dragPreview.kind === AREA_SELECT_DRAG_KIND) {
        ui.setDragPreview(null);
      }
      return;
    }
    const putative: AreaSelectPutative = {
      start: { x: areaSelectOverlay.start.worldX, y: areaSelectOverlay.start.worldY },
      current: { x: areaSelectOverlay.current.worldX, y: areaSelectOverlay.current.worldY },
      shiftHeld: areaSelectOverlay.shiftHeld,
    };
    ui.setDragPreview({ kind: AREA_SELECT_DRAG_KIND, putative });
  }, [areaSelectOverlay]);

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
        // Marquee rectangle is now rendered by the framework's
        // `dragPreviewLayer` via `areaSelectDrag.renderPreview`. See
        // `src/canvas/drag/areaSelectDrag.ts` and the `areaSelect.overlay`
        // → `uiStore.dragPreview` mirror effect above.

        // Move ghosts (plantings, structures, zones) and snap-target outlines
        // are now drawn by the framework's `dragPreviewLayer` via
        // `moveDrag.renderPreview`. See `src/canvas/drag/moveDrag.ts` and the
        // `move.overlay` → `uiStore.dragPreview` mirror effect above.

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
            // item.x/y = planting.x/y (local coords) + drag delta.
            // Recover the delta and apply to the world-space position.
            const world = plantingWorldPose(garden, planting);
            const wx = world.x + (item.x - planting.x);
            const wy = world.y + (item.y - planting.y);
            const sx = (wx - view.x) * view.scale;
            const sy = (wy - view.y) * view.scale;
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
    [cloneOverlay],
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
            // No-drag click: if scratch landed in 'area' (empty hit), the
            // click missed every entity body. Before falling through to the
            // legacy "clear on plain click" behavior, check whether the
            // click landed on the *implicit outline edge* of a group
            // sibling — i.e. a structure pulled into the rendered selection
            // by `expandToGroups` but not present in `useUiStore.selectedIds`.
            // If so, promote the selection to the whole group (or, on
            // shift-click, ADD the siblings to the existing selection).
            if (ctx.scratch.kind === 'area') {
              const ui = useUiStore.getState();
              const sel = ui.selectedIds;
              if (sel.length > 0) {
                const structures = useGardenStore.getState().garden.structures;
                const expanded = expandToGroups(sel, structures);
                if (expanded.length > sel.length) {
                  const explicitSet = new Set(sel);
                  const tolWorld = OUTLINE_EDGE_HIT_PX / Math.max(0.0001, ctx.view.scale);
                  const byId = new Map(structures.map((s) => [s.id, s] as const));
                  let hitSibling = false;
                  for (const id of expanded) {
                    if (explicitSet.has(id)) continue;
                    const s = byId.get(id);
                    if (!s) continue;
                    if (hitOutlineEdge(s, ctx.worldX, ctx.worldY, tolWorld)) {
                      hitSibling = true;
                      break;
                    }
                  }
                  if (hitSibling) {
                    // Shift-click ADDs siblings; plain click promotes
                    // selection to the entire group. expandToGroups already
                    // returns the union, so both are setSelection(expanded).
                    // The distinction is only visible when the original
                    // selection mixed grouped + ungrouped ids — expanded
                    // preserves the ungrouped ids in either case, so a
                    // shift-click never loses unrelated selections, while a
                    // plain click also preserves them (matches "expand my
                    // selection to the group I already partially selected"
                    // semantics rather than "discard everything else").
                    ui.setSelection(expanded);
                    ctx.scratch = { kind: 'idle' };
                    return 'claim';
                  }
                }
              }
              if (!ctx.modifiers.shift) {
                ui.clearSelection();
              }
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
                const bounds = { x: s.x, y: s.y, width: s.width, height: s.length };
                for (const h of cornerResizeHandles(bounds)) {
                  if (hitCornerHandle(h, ctx.worldX, ctx.worldY, radiusWorld)) {
                    ctx.scratch = { kind: 'resize', targetId: id, layer: 'structures', anchor: h.anchor };
                    return 'claim';
                  }
                }
              }
              const z = getZone(id);
              if (z) {
                const bounds = { x: z.x, y: z.y, width: z.width, height: z.length };
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
