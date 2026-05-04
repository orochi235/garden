import { useMemo, useRef } from 'react';
import { defineTool, type RenderLayer, type Tool } from '@orochi235/weasel';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import {
  DRAG_SPREAD_GUTTER_RATIO,
  findSeedlingsInRect,
  hitTestCellInches,
  hitTestDragSpreadAffordanceInches,
  type DragSpreadAffordanceHit,
} from '../seedStartingHitTest';
import { trayInteriorOffsetIn, type Seedling, type Tray } from '../../model/seedStarting';
import { resolveGroupMoves } from '../../model/seedlingMoveResolver';
import type { SeedStartingSceneAdapter } from '../adapters/seedStartingScene';

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
  affordance: DragSpreadAffordanceHit | null;
  /** Cultivar id of the dragged anchor — used to render gutter markers. */
  cultivarId: string | null;
  /** Active marquee gesture (drag from empty space). World inches. */
  marquee: { startX: number; startY: number; x: number; y: number; shift: boolean } | null;
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
  marquee: null,
});

function findSeedlingAt(worldX: number, worldY: number): { tray: Tray; seedling: Seedling } | null {
  const ss = useGardenStore.getState().garden.seedStarting;
  for (const tray of ss.trays) {
    const cell = hitTestCellInches(tray, worldX, worldY);
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
        // Marquee rectangle in screen space (mirrors garden eric-select-overlay).
        if (s.marquee) {
          const m = s.marquee;
          const x = Math.min(m.startX, m.x);
          const y = Math.min(m.startY, m.y);
          const w = Math.abs(m.x - m.startX);
          const h = Math.abs(m.y - m.startY);
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
        const off = trayInteriorOffsetIn(tray);
        const scale = view.scale;
        const cellPx = tray.cellPitchIn * scale;
        const gutterPx = cellPx * DRAG_SPREAD_GUTTER_RATIO;
        const markerLen = Math.min(gutterPx * 0.45, cellPx * 0.3);
        const markerW = Math.max(1.5, cellPx * 0.1);
        const baseFill = '#d4a55a';
        const baseStroke = '#1a1a1a';
        const hoverFill = '#ffd27a';

        // Grid origin in screen coords.
        const gridScreenX = (off.x - view.x) * scale;
        const gridScreenY = (off.y - view.y) * scale;

        // Per-column markers along the top edge.
        for (let c = 0; c < tray.cols; c++) {
          const cx = gridScreenX + c * cellPx + cellPx / 2;
          const cy = gridScreenY - gutterPx / 2;
          const isHover = affKind === 'col' && affIndex === c;
          drawMarker(ctx, cx, cy, markerLen, markerW, 0, isHover ? hoverFill : baseFill, baseStroke);
        }
        // Per-row markers along the left edge.
        for (let r = 0; r < tray.rows; r++) {
          const cx = gridScreenX - gutterPx / 2;
          const cy = gridScreenY + r * cellPx + cellPx / 2;
          const isHover = affKind === 'row' && affIndex === r;
          drawMarker(ctx, cx, cy, markerLen, markerW, -Math.PI / 2, isHover ? hoverFill : baseFill, baseStroke);
        }
        // Diagonal corner marker.
        {
          const cx = gridScreenX - gutterPx / 2;
          const cy = gridScreenY - gutterPx / 2;
          const gridCx = gridScreenX + (tray.cols * cellPx) / 2;
          const gridCy = gridScreenY + (tray.rows * cellPx) / 2;
          const angle = Math.atan2(-(gridCx - cx), gridCy - cy);
          const isHover = affKind === 'all';
          drawMarker(
            ctx,
            cx,
            cy,
            markerLen * 1.45,
            markerW * 1.35,
            angle,
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
            if (hit) return 'pass';
            if (!ctx.modifiers.shift) useUiStore.getState().clearSelection();
            ctx.scratch.marquee = null;
            scratchRef.current = ctx.scratch;
            return 'claim';
          },
          onDown: (e, ctx) => {
            if (e.button !== 0) return 'pass';
            // A palette drag-to-sow is active; defer to sow tool.
            if (useUiStore.getState().seedDragCultivarId) return 'pass';
            const hit = findSeedlingAt(ctx.worldX, ctx.worldY);
            if (!hit) {
              ctx.scratch.marquee = {
                startX: ctx.worldX,
                startY: ctx.worldY,
                x: ctx.worldX,
                y: ctx.worldY,
                shift: ctx.modifiers.shift,
              };
              scratchRef.current = ctx.scratch;
              return 'claim';
            }

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
            if (ctx.scratch.marquee) {
              scratchRef.current = ctx.scratch;
              return 'claim';
            }
            if (!ctx.scratch.draggedId) return 'pass';
            ctx.scratch.active = true;
            // Hide every dragged seedling so the canvas shows movement.
            useUiStore.getState().setHiddenSeedlingIds(ctx.scratch.groupIds);
            scratchRef.current = ctx.scratch;
            return 'claim';
          },
          onMove: (_e, ctx) => {
            if (ctx.scratch.marquee) {
              ctx.scratch.marquee.x = ctx.worldX;
              ctx.scratch.marquee.y = ctx.worldY;
              scratchRef.current = ctx.scratch;
              return 'claim';
            }
            if (!ctx.scratch.active) return 'pass';
            ctx.scratch.currentWorld = { x: ctx.worldX, y: ctx.worldY };
            const ss = useGardenStore.getState().garden.seedStarting;
            const tray = ss.trays.find((t) => t.id === ctx.scratch.trayId);
            if (!tray) return 'claim';

            if (!ctx.scratch.isGroup) {
              const aff = hitTestDragSpreadAffordanceInches(tray, ctx.worldX, ctx.worldY);
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
                useUiStore.getState().setSeedMovePreview(null);
                scratchRef.current = ctx.scratch;
                return 'claim';
              }
            } else {
              ctx.scratch.affordance = null;
            }

            const cell = hitTestCellInches(tray, ctx.worldX, ctx.worldY);
            if (!cell) {
              useUiStore.getState().setSeedFillPreview(null);
              useUiStore.getState().setSeedMovePreview(null);
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
              useUiStore.getState().setSeedMovePreview({
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
              useUiStore.getState().setSeedMovePreview(null);
            } else {
              useUiStore.getState().setSeedFillPreview(null);
              useUiStore.getState().setSeedMovePreview(null);
            }
            scratchRef.current = ctx.scratch;
            return 'claim';
          },
          onEnd: (_e, ctx) => {
            if (ctx.scratch.marquee) {
              const m = ctx.scratch.marquee;
              const ss = useGardenStore.getState().garden.seedStarting;
              const rect = {
                x: m.startX,
                y: m.startY,
                width: m.x - m.startX,
                height: m.y - m.startY,
              };
              const ids = findSeedlingsInRect(ss.trays, ss.seedlings, rect);
              const ui = useUiStore.getState();
              if (m.shift) {
                const merged = Array.from(new Set([...ui.selectedIds, ...ids]));
                ui.setSelection(merged);
              } else {
                ui.setSelection(ids);
              }
              ctx.scratch.marquee = null;
              scratchRef.current = ctx.scratch;
              return 'claim';
            }
            if (!ctx.scratch.active) return 'pass';
            const trayId = ctx.scratch.trayId!;
            const ss = useGardenStore.getState().garden.seedStarting;
            const tray = ss.trays.find((t) => t.id === trayId);
            const cleanup = () => {
              useUiStore.getState().setSeedFillPreview(null);
              useUiStore.getState().setSeedMovePreview(null);
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

            const cell = hitTestCellInches(tray, ctx.worldX, ctx.worldY);
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
            useUiStore.getState().setSeedMovePreview(null);
            useUiStore.getState().setHiddenSeedlingIds([]);
            ctx.scratch.active = false;
            ctx.scratch.affordance = null;
            ctx.scratch.marquee = null;
            scratchRef.current = ctx.scratch;
          },
        },
      }),
    [overlay],
  );
}
