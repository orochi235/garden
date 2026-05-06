import { useMemo, useRef } from 'react';
import { defineTool, type RenderLayer, type Tool } from '@orochi235/weasel';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import {
  hitTestCellAcrossTrays,
  hitTestCellInches,
} from '../seedStartingHitTest';
import { DRAG_SPREAD_GUTTER_RATIO } from '../layouts/trayDropTargets';
import {
  getTrayDropTargets,
  hitTrayDropTarget,
  type TrayGutterMeta,
} from '../layouts/trayDropTargets';
import { trayInteriorOffsetIn, type Seedling, type Tray } from '../../model/seedStarting';
import { resolveGroupMoves } from '../../model/seedlingMoveResolver';
import { trayWorldOrigin, type SeedStartingSceneAdapter } from '../adapters/seedStartingScene';
import {
  SEEDLING_MOVE_DRAG_KIND,
  type SeedlingMovePutative,
} from '../drag/seedlingMoveDrag';

/**
 * Publish a seedling-move ghost putative into the framework's shared
 * `dragPreview` slot. Mirrors the legacy `setSeedMovePreview` writes.
 *
 * This is the façade pattern: the Tool owns the gesture (scratch is mutated
 * imperatively in the kit Tool callbacks) and publishes putatives to the
 * shared slot directly. The framework's `dragPreviewLayer` then renders via
 * `seedlingMoveDrag.renderPreview`. We don't use a `useEffect` mirror because
 * scratch state isn't React-reactive — the kit Tool exposes no overlay
 * snapshot we could subscribe to. Direct writes from the handler are the
 * pragmatic equivalent.
 */
function setMoveGhost(p: SeedlingMovePutative | null): void {
  const ui = useUiStore.getState();
  if (p) {
    ui.setDragPreview({ kind: SEEDLING_MOVE_DRAG_KIND, putative: p });
  } else if (ui.dragPreview && ui.dragPreview.kind === SEEDLING_MOVE_DRAG_KIND) {
    ui.setDragPreview(null);
  }
}

export interface SeedlingMoveScratch {
  active: boolean;
  draggedId: string | null;
  trayId: string | null;
  isGroup: boolean;
  groupIds: string[];
  anchorFromRow: number;
  anchorFromCol: number;
  startWorld: { x: number; y: number };
  currentWorld: { x: number; y: number };
  affordance: TrayGutterMeta | null;
  /** Cultivar id of the dragged anchor — used to render gutter markers. */
  cultivarId: string | null;
}

const initScratch = (): SeedlingMoveScratch => ({
  active: false,
  draggedId: null,
  trayId: null,
  isGroup: false,
  groupIds: [],
  anchorFromRow: 0,
  anchorFromCol: 0,
  startWorld: { x: 0, y: 0 },
  currentWorld: { x: 0, y: 0 },
  affordance: null,
  cultivarId: null,
});

function findSeedlingAt(worldX: number, worldY: number): { tray: Tray; seedling: Seedling } | null {
  const ss = useGardenStore.getState().garden.seedStarting;
  for (const tray of ss.trays) {
    const o = trayWorldOrigin(tray, ss);
    const cell = hitTestCellInches(tray, worldX - o.x, worldY - o.y);
    if (!cell) continue;
    const slot = tray.slots[cell.row * tray.cols + cell.col];
    if (slot.state !== 'sown' || !slot.seedlingId) continue;
    const s = ss.seedlings.find((x) => x.id === slot.seedlingId);
    if (s) return { tray, seedling: s };
  }
  return null;
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  length: number,
  width: number,
  rotation: number,
  fill: string,
  stroke: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  const plateW = width * 2.6;
  const top = -length / 2;
  const tip = length / 2;
  const shoulder = tip - plateW / 2;
  ctx.lineWidth = 1;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(-plateW / 2, top);
  ctx.lineTo(plateW / 2, top);
  ctx.lineTo(plateW / 2, shoulder);
  ctx.lineTo(0, tip);
  ctx.lineTo(-plateW / 2, shoulder);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function useSeedlingMoveTool(adapter: SeedStartingSceneAdapter): Tool<SeedlingMoveScratch> {
  // Stable mutable mirror so the overlay's draw closure (defined once) sees
  // current scratch values across renders without re-creating the layer.
  const scratchRef = useRef<SeedlingMoveScratch>(initScratch());
  void adapter;

  const overlay = useMemo<RenderLayer<unknown>>(
    () => ({
      id: 'seedling-move-gutter-overlay',
      label: 'Seedling Gutter Affordances',
      space: 'screen',
      draw(ctx, _data, view) {
        const s = scratchRef.current;
        // Marquee rendering moved to `useSeedSelectTool` + the framework's
        // `dragPreviewLayer` (kind = AREA_SELECT_DRAG_KIND). This overlay only
        // draws gutter affordances now.
        const ui = useUiStore.getState();
        // Two ways to activate the gutter overlay:
        //  1. seedling-drag scratch (existing seedling being relocated)
        //  2. palette-drag (cultivar being dropped in from the palette)
        const seedlingDragActive = s.active && !s.isGroup && !!s.trayId;
        const paletteDragActive = ui.seedDragCultivarId != null;
        if (!seedlingDragActive && !paletteDragActive) return;

        // Resolve the target tray and the currently-hovered affordance.
        let trayId: string | null = null;
        let affKind: 'all' | 'row' | 'col' | null = null;
        let affIndex = -1;
        if (seedlingDragActive) {
          trayId = s.trayId;
          if (s.affordance) {
            affKind = s.affordance.kind;
            if (s.affordance.kind === 'row') affIndex = s.affordance.row;
            else if (s.affordance.kind === 'col') affIndex = s.affordance.col;
          }
        } else {
          // Palette drag: prefer the tray referenced by the live fill preview;
          // fall back to the active tray.
          trayId = ui.seedFillPreview?.trayId ?? ui.currentTrayId;
          const fp = ui.seedFillPreview;
          if (fp && (fp.scope === 'all' || fp.scope === 'row' || fp.scope === 'col')) {
            affKind = fp.scope;
            if (fp.scope === 'row' || fp.scope === 'col') affIndex = fp.index;
          }
        }
        if (!trayId) return;
        const tray = useGardenStore.getState().garden.seedStarting.trays.find((t) => t.id === trayId);
        if (!tray) return;
        const scale = view.scale;
        const cellPx = tray.cellPitchIn * scale;
        const gutterPx = cellPx * DRAG_SPREAD_GUTTER_RATIO;
        const markerLen = Math.min(gutterPx * 0.45, cellPx * 0.3);
        const markerW = Math.max(1.5, cellPx * 0.1);
        const baseFill = '#d4a55a';
        const baseStroke = '#1a1a1a';
        const hoverFill = '#ffd27a';

        // Grid center for the diagonal corner marker's rotation.
        const off = trayInteriorOffsetIn(tray);
        const gridCx = (off.x + (tray.cols * tray.cellPitchIn) / 2 - view.x) * scale;
        const gridCy = (off.y + (tray.rows * tray.cellPitchIn) / 2 - view.y) * scale;

        // Iterate gutter targets — chevron position = target origin in world,
        // converted to screen. Hovered target lights up.
        for (const t of getTrayDropTargets(tray)) {
          if (t.meta.kind === 'cell') continue;
          const cx = (t.origin.x - view.x) * scale;
          const cy = (t.origin.y - view.y) * scale;
          let isHover = false;
          let rotation = 0;
          let lenScale = 1;
          let widthScale = 1;
          if (t.meta.kind === 'col') {
            rotation = 0;
            isHover = affKind === 'col' && affIndex === t.meta.col;
          } else if (t.meta.kind === 'row') {
            rotation = -Math.PI / 2;
            isHover = affKind === 'row' && affIndex === t.meta.row;
          } else {
            rotation = Math.atan2(-(gridCx - cx), gridCy - cy);
            lenScale = 1.45;
            widthScale = 1.35;
            isHover = affKind === 'all';
          }
          drawMarker(
            ctx,
            cx,
            cy,
            markerLen * lenScale,
            markerW * widthScale,
            rotation,
            isHover ? hoverFill : baseFill,
            baseStroke,
          );
        }
      },
    }),
    [],
  );

  return useMemo(
    () =>
      defineTool<SeedlingMoveScratch>({
        id: 'seedling-move',
        cursor: 'default',
        overlay,
        initScratch: () => {
          const s = initScratch();
          scratchRef.current = s;
          return s;
        },

        pointer: {
          onClick: (e, ctx) => {
            if (e.button !== 0) return 'pass';
            const hit = findSeedlingAt(ctx.worldX, ctx.worldY);
            if (!hit) return 'pass'; // empty-click handled by useSeedSelectTool
            return 'pass';
          },
          onDown: (e, ctx) => {
            if (e.button !== 0) return 'pass';
            // A palette drag-to-sow is active; defer to sow tool.
            if (useUiStore.getState().seedDragCultivarId) return 'pass';
            const hit = findSeedlingAt(ctx.worldX, ctx.worldY);
            if (!hit) return 'pass'; // empty-down handled by useSeedSelectTool

            const ui = useUiStore.getState();
            // Update selection like legacy: shift extends, plain click selects
            // if not already in selection.
            if (ctx.modifiers.shift) {
              if (!ui.selectedIds.includes(hit.seedling.id)) ui.addToSelection(hit.seedling.id);
            } else if (!ui.selectedIds.includes(hit.seedling.id)) {
              ui.select(hit.seedling.id);
            }

            const sel = useUiStore.getState().selectedIds;
            const isAnchorSelected = sel.includes(hit.seedling.id);
            const groupIds =
              isAnchorSelected && sel.length > 1 ? sel.slice() : [hit.seedling.id];
            const isGroup = groupIds.length > 1;

            ctx.scratch.draggedId = hit.seedling.id;
            ctx.scratch.trayId = hit.tray.id;
            ctx.scratch.isGroup = isGroup;
            ctx.scratch.groupIds = groupIds;
            ctx.scratch.anchorFromRow = hit.seedling.row ?? 0;
            ctx.scratch.anchorFromCol = hit.seedling.col ?? 0;
            ctx.scratch.startWorld = { x: ctx.worldX, y: ctx.worldY };
            ctx.scratch.currentWorld = { x: ctx.worldX, y: ctx.worldY };
            ctx.scratch.cultivarId = hit.seedling.cultivarId;
            scratchRef.current = ctx.scratch;
            return 'claim';
          },
        },

        drag: {
          onStart: (_e, ctx) => {
            if (!ctx.scratch.draggedId) return 'pass';
            ctx.scratch.active = true;
            // Hide every dragged seedling so the canvas shows movement.
            useUiStore.getState().setHiddenSeedlingIds(ctx.scratch.groupIds);
            scratchRef.current = ctx.scratch;
            return 'claim';
          },
          onMove: (_e, ctx) => {
            if (!ctx.scratch.active) return 'pass';
            ctx.scratch.currentWorld = { x: ctx.worldX, y: ctx.worldY };
            const ss = useGardenStore.getState().garden.seedStarting;
            const tray = ss.trays.find((t) => t.id === ctx.scratch.trayId);
            if (!tray) return 'claim';

            if (!ctx.scratch.isGroup) {
              const hit = hitTrayDropTarget(getTrayDropTargets(tray), { x: ctx.worldX, y: ctx.worldY });
              const aff: TrayGutterMeta | null =
                hit && hit.meta.kind !== 'cell' ? hit.meta : null;
              ctx.scratch.affordance = aff;
              if (aff) {
                const base = { trayId: tray.id, cultivarId: ctx.scratch.cultivarId!, replace: true };
                useUiStore.getState().setSeedFillPreview(
                  aff.kind === 'all'
                    ? { ...base, scope: 'all' }
                    : aff.kind === 'row'
                      ? { ...base, scope: 'row', index: aff.row }
                      : { ...base, scope: 'col', index: aff.col },
                );
                setMoveGhost(null);
                scratchRef.current = ctx.scratch;
                return 'claim';
              }
            } else {
              ctx.scratch.affordance = null;
            }

            // Cross-tray hit-test for single-seedling drags. Group drags stay
            // intra-source-tray (anchor-delta semantics don't generalize
            // across trays of different shapes/sizes).
            const crossHit = !ctx.scratch.isGroup
              ? hitTestCellAcrossTrays(ss.trays, ctx.worldX, ctx.worldY, (t) => trayWorldOrigin(t, ss))
              : null;
            const o = trayWorldOrigin(tray, ss);
            const cell = ctx.scratch.isGroup
              ? hitTestCellInches(tray, ctx.worldX - o.x, ctx.worldY - o.y)
              : (crossHit && crossHit.trayId === tray.id ? { row: crossHit.row, col: crossHit.col } : null);
            // Cross-tray drop: target is a different tray. Render a single-cell
            // ghost on the destination via setMoveGhost (feasibility = dest
            // cell empty). Don't set the (intra-tray) seedFillPreview.
            if (!ctx.scratch.isGroup && crossHit && crossHit.trayId !== tray.id) {
              const destTray = ss.trays.find((t) => t.id === crossHit.trayId);
              if (destTray) {
                const destSlot = destTray.slots[crossHit.row * destTray.cols + crossHit.col];
                const destFree = destSlot.state === 'empty';
                setMoveGhost({
                  trayId: destTray.id,
                  feasible: destFree,
                  cells: [{
                    row: crossHit.row,
                    col: crossHit.col,
                    cultivarId: ctx.scratch.cultivarId!,
                    bumped: false,
                  }],
                });
                useUiStore.getState().setSeedFillPreview(null);
                scratchRef.current = ctx.scratch;
                return 'claim';
              }
            }
            if (!cell) {
              useUiStore.getState().setSeedFillPreview(null);
              setMoveGhost(null);
              scratchRef.current = ctx.scratch;
              return 'claim';
            }

            if (ctx.scratch.isGroup) {
              const dr = cell.row - ctx.scratch.anchorFromRow;
              const dc = cell.col - ctx.scratch.anchorFromCol;
              const groupSeedlings = ctx.scratch.groupIds
                .map((id) => ss.seedlings.find((s) => s.id === id))
                .filter((s): s is Seedling =>
                  !!s && s.trayId === tray.id && s.row != null && s.col != null);
              const pending = groupSeedlings.map((s) => ({
                seedlingId: s.id,
                cultivarId: s.cultivarId,
                fromRow: s.row!,
                fromCol: s.col!,
                toRow: s.row! + dr,
                toCol: s.col! + dc,
              }));
              const result = resolveGroupMoves(tray, pending);
              setMoveGhost({
                trayId: tray.id,
                feasible: result.feasible,
                cells: result.moves.map((m) => ({
                  row: m.finalRow,
                  col: m.finalCol,
                  cultivarId: m.cultivarId,
                  bumped: m.bumped,
                })),
              });
              useUiStore.getState().setSeedFillPreview(null);
            } else if (cell.row !== ctx.scratch.anchorFromRow || cell.col !== ctx.scratch.anchorFromCol) {
              useUiStore.getState().setSeedFillPreview({
                trayId: tray.id,
                cultivarId: ctx.scratch.cultivarId!,
                scope: 'cell',
                row: cell.row,
                col: cell.col,
                replace: true,
              });
              setMoveGhost(null);
            } else {
              useUiStore.getState().setSeedFillPreview(null);
              setMoveGhost(null);
            }
            scratchRef.current = ctx.scratch;
            return 'claim';
          },
          onEnd: (_e, ctx) => {
            if (!ctx.scratch.active) return 'pass';
            const trayId = ctx.scratch.trayId!;
            const ss = useGardenStore.getState().garden.seedStarting;
            const tray = ss.trays.find((t) => t.id === trayId);
            const cleanup = () => {
              useUiStore.getState().setSeedFillPreview(null);
              setMoveGhost(null);
              useUiStore.getState().setHiddenSeedlingIds([]);
              ctx.scratch.active = false;
              ctx.scratch.affordance = null;
              scratchRef.current = ctx.scratch;
            };
            if (!tray) {
              cleanup();
              return 'claim';
            }

            if (!ctx.scratch.isGroup && ctx.scratch.affordance) {
              const gs = useGardenStore.getState();
              const cultivarId = ctx.scratch.cultivarId!;
              gs.clearCell(trayId, ctx.scratch.anchorFromRow, ctx.scratch.anchorFromCol);
              const aff = ctx.scratch.affordance;
              if (aff.kind === 'all') gs.fillTray(trayId, cultivarId, { replace: true });
              else if (aff.kind === 'row') gs.fillRow(trayId, aff.row, cultivarId, { replace: true });
              else gs.fillColumn(trayId, aff.col, cultivarId, { replace: true });
              cleanup();
              return 'claim';
            }

            const oEnd = trayWorldOrigin(tray, ss);
            // Cross-tray drop on commit: single-seedling drags only.
            const crossHitEnd = !ctx.scratch.isGroup
              ? hitTestCellAcrossTrays(ss.trays, ctx.worldX, ctx.worldY, (t) => trayWorldOrigin(t, ss))
              : null;
            if (
              !ctx.scratch.isGroup
              && crossHitEnd
              && crossHitEnd.trayId !== trayId
            ) {
              const destTray = ss.trays.find((t) => t.id === crossHitEnd.trayId);
              if (destTray) {
                const destSlot = destTray.slots[crossHitEnd.row * destTray.cols + crossHitEnd.col];
                if (destSlot.state === 'empty') {
                  useGardenStore.getState().moveSeedlingsAcrossTrays([
                    {
                      seedlingId: ctx.scratch.draggedId!,
                      fromTrayId: trayId,
                      toTrayId: crossHitEnd.trayId,
                      toRow: crossHitEnd.row,
                      toCol: crossHitEnd.col,
                    },
                  ]);
                }
                cleanup();
                return 'claim';
              }
            }
            const cell = hitTestCellInches(tray, ctx.worldX - oEnd.x, ctx.worldY - oEnd.y);
            if (ctx.scratch.isGroup) {
              if (!cell) {
                cleanup();
                return 'claim';
              }
              const dr = cell.row - ctx.scratch.anchorFromRow;
              const dc = cell.col - ctx.scratch.anchorFromCol;
              if (dr === 0 && dc === 0) {
                cleanup();
                return 'claim';
              }
              const groupSeedlings = ctx.scratch.groupIds
                .map((id) => ss.seedlings.find((s) => s.id === id))
                .filter((s): s is Seedling =>
                  !!s && s.trayId === tray.id && s.row != null && s.col != null);
              const pending = groupSeedlings.map((s) => ({
                seedlingId: s.id,
                cultivarId: s.cultivarId,
                fromRow: s.row!,
                fromCol: s.col!,
                toRow: s.row! + dr,
                toCol: s.col! + dc,
              }));
              const result = resolveGroupMoves(tray, pending);
              if (!result.feasible) {
                cleanup();
                return 'claim';
              }
              useGardenStore.getState().moveSeedlingGroup(
                trayId,
                result.moves.map((m) => ({
                  seedlingId: m.seedlingId,
                  toRow: m.finalRow,
                  toCol: m.finalCol,
                })),
              );
              cleanup();
              return 'claim';
            }

            if (!cell) {
              useGardenStore.getState().clearCell(trayId, ctx.scratch.anchorFromRow, ctx.scratch.anchorFromCol);
              cleanup();
              return 'claim';
            }
            if (cell.row === ctx.scratch.anchorFromRow && cell.col === ctx.scratch.anchorFromCol) {
              cleanup();
              return 'claim';
            }
            useGardenStore.getState().moveSeedling(
              trayId,
              ctx.scratch.anchorFromRow,
              ctx.scratch.anchorFromCol,
              cell.row,
              cell.col,
            );
            cleanup();
            return 'claim';
          },
          onCancel: (ctx) => {
            useUiStore.getState().setSeedFillPreview(null);
            setMoveGhost(null);
            useUiStore.getState().setHiddenSeedlingIds([]);
            ctx.scratch.active = false;
            ctx.scratch.affordance = null;
            scratchRef.current = ctx.scratch;
          },
        },
      }),
    [overlay],
  );
}
