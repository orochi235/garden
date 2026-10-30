import { type Dims, PathBuilder, type RenderLayer, type View } from '@weasel-js/core';
import { useMemo, useRef } from 'react';
import { type Seedling, type Tray, trayInteriorOffsetIn } from '../../model/nursery';
import { resolveGroupMoves } from '../../model/seedlingMoveResolver';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { trayWorldOrigin } from '../adapters/nurseryScene';
import { SEED_FILL_TRAY_DRAG_KIND, type SeedFillPutative } from '../drag/seedFillTrayDrag';
import { SEEDLING_MOVE_DRAG_KIND, type SeedlingMovePutative } from '../drag/seedlingMoveDrag';
import {
  DRAG_SPREAD_GUTTER_RATIO,
  getTrayDropTargets,
  hitTrayDropTarget,
  type TrayGutterMeta,
} from '../layouts/trayDropTargets';
import { hitTestCellAcrossTrays, hitTestCellInches } from '../nurseryHitTest';
import type { DrawCommand } from '../util/weaselLocal';
import type { GesturePoint, NurseryDragGesture, NurseryDragHandle } from './nurseryGestures';

/**
 * Publish a seedling-move ghost putative into the framework's shared
 * `dragPreview` slot. Mirrors the legacy `setSeedMovePreview` writes.
 *
 * The gesture mutates its scratch imperatively and publishes putatives here;
 * the framework's `dragPreviewLayer` renders them via
 * `seedlingMoveDrag.renderPreview`.
 */
function setMoveGhost(p: SeedlingMovePutative | null): void {
  const ui = useUiStore.getState();
  if (p) {
    ui.setDragPreview({ kind: SEEDLING_MOVE_DRAG_KIND, putative: p });
  } else if (ui.dragPreview && ui.dragPreview.kind === SEEDLING_MOVE_DRAG_KIND) {
    ui.setDragPreview(null);
  }
}

/**
 * Publish a seed-fill putative for the row/col/all gutter affordance shown
 * when the user drags an existing seedling over a tray gutter. Mirrors the
 * legacy `setSeedFillPreview` writes that drove the now-deleted
 * `seedling-fill-preview` layer.
 *
 * Like `setMoveGhost`, only clears the slot if it currently holds our kind —
 * the move tool alternates between writing a fill-ghost and a move-ghost as
 * the pointer moves, and we don't want a fill-clear to stomp a move-ghost
 * the next branch just wrote (or vice versa).
 */
function setFillGhost(p: SeedFillPutative | null): void {
  const ui = useUiStore.getState();
  if (p) {
    ui.setDragPreview({ kind: SEED_FILL_TRAY_DRAG_KIND, putative: p });
  } else if (ui.dragPreview && ui.dragPreview.kind === SEED_FILL_TRAY_DRAG_KIND) {
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
  const ss = useGardenStore.getState().garden.nursery;
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

function markerCommands(
  cx: number,
  cy: number,
  length: number,
  width: number,
  rotation: number,
  fillColor: string,
  strokeColor: string,
): DrawCommand[] {
  const plateW = width * 2.6;
  const top = -length / 2;
  const tip = length / 2;
  const shoulder = tip - plateW / 2;
  // Build path in local (0,0) coords, then wrap in a transform group.
  const path = new PathBuilder()
    .moveTo(-plateW / 2, top)
    .lineTo(plateW / 2, top)
    .lineTo(plateW / 2, shoulder)
    .lineTo(0, tip)
    .lineTo(-plateW / 2, shoulder)
    .close()
    .build();
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  // Column-major 3×3: [cos, sin, 0, -sin, cos, 0, cx, cy, 1]
  const transform = new Float32Array([cos, sin, 0, -sin, cos, 0, cx, cy, 1]);
  return [
    {
      kind: 'group',
      transform,
      children: [
        { kind: 'path', path, fill: { paint: { color: fillColor } } },
        { kind: 'path', path, stroke: { paint: { color: strokeColor }, width: 1 } },
      ],
    },
  ];
}

/** Live state of an in-flight seedling drag: the tool scratch plus the pointer
 *  sample the handlers read. Weasel 0.7's ongoing-action handle pumps `move` /
 *  `end` with a fresh point each time, so the point rides here rather than on a
 *  kit-supplied `ToolCtx`. */
interface MoveDragState {
  scratch: SeedlingMoveScratch;
  worldX: number;
  worldY: number;
  modifiers: { shift: boolean; alt: boolean };
}

function onDragMove(st: MoveDragState): void {
  if (!st.scratch.active) return;
  st.scratch.currentWorld = { x: st.worldX, y: st.worldY };
  const ss = useGardenStore.getState().garden.nursery;
  const tray = ss.trays.find((t) => t.id === st.scratch.trayId);
  if (!tray) return;

  if (!st.scratch.isGroup) {
    const hit = hitTrayDropTarget(getTrayDropTargets(tray), {
      x: st.worldX,
      y: st.worldY,
    });
    const aff: TrayGutterMeta | null = hit && hit.meta.kind !== 'cell' ? hit.meta : null;
    st.scratch.affordance = aff;
    if (aff) {
      const base = {
        trayId: tray.id,
        cultivarId: st.scratch.cultivarId!,
        replace: true,
      };
      setFillGhost(
        aff.kind === 'all'
          ? { ...base, scope: 'all' }
          : aff.kind === 'row'
            ? { ...base, scope: 'row', index: aff.row }
            : { ...base, scope: 'col', index: aff.col },
      );
      setMoveGhost(null);
      return;
    }
  } else {
    st.scratch.affordance = null;
  }

  // Cross-tray hit-test for single-seedling drags. Group drags stay
  // intra-source-tray (anchor-delta semantics don't generalize
  // across trays of different shapes/sizes).
  const crossHit = !st.scratch.isGroup
    ? hitTestCellAcrossTrays(ss.trays, st.worldX, st.worldY, (t) => trayWorldOrigin(t, ss))
    : null;
  const o = trayWorldOrigin(tray, ss);
  const cell = st.scratch.isGroup
    ? hitTestCellInches(tray, st.worldX - o.x, st.worldY - o.y)
    : crossHit && crossHit.trayId === tray.id
      ? { row: crossHit.row, col: crossHit.col }
      : null;
  // Cross-tray drop: target is a different tray. Render a single-cell
  // ghost on the destination via setMoveGhost (feasibility = dest
  // cell empty). Don't set the (intra-tray) fill ghost.
  if (!st.scratch.isGroup && crossHit && crossHit.trayId !== tray.id) {
    const destTray = ss.trays.find((t) => t.id === crossHit.trayId);
    if (destTray) {
      const destSlot = destTray.slots[crossHit.row * destTray.cols + crossHit.col];
      const destFree = destSlot.state === 'empty';
      setMoveGhost({
        trayId: destTray.id,
        feasible: destFree,
        cells: [
          {
            row: crossHit.row,
            col: crossHit.col,
            cultivarId: st.scratch.cultivarId!,
            bumped: false,
          },
        ],
      });
      setFillGhost(null);
      return;
    }
  }
  if (!cell) {
    setFillGhost(null);
    setMoveGhost(null);
    return;
  }

  if (st.scratch.isGroup) {
    const dr = cell.row - st.scratch.anchorFromRow;
    const dc = cell.col - st.scratch.anchorFromCol;
    const groupSeedlings = st.scratch.groupIds
      .map((id) => ss.seedlings.find((s) => s.id === id))
      .filter((s): s is Seedling => !!s && s.trayId === tray.id && s.row != null && s.col != null);
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
    setFillGhost(null);
  } else if (cell.row !== st.scratch.anchorFromRow || cell.col !== st.scratch.anchorFromCol) {
    setFillGhost({
      trayId: tray.id,
      cultivarId: st.scratch.cultivarId!,
      scope: 'cell',
      row: cell.row,
      col: cell.col,
      replace: true,
    });
    setMoveGhost(null);
  } else {
    setFillGhost(null);
    setMoveGhost(null);
  }
  return;
}

function onDragEnd(st: MoveDragState): void {
  if (!st.scratch.active) return;
  const trayId = st.scratch.trayId!;
  const ss = useGardenStore.getState().garden.nursery;
  const tray = ss.trays.find((t) => t.id === trayId);
  const cleanup = () => {
    setFillGhost(null);
    setMoveGhost(null);
    useUiStore.getState().setHiddenSeedlingIds([]);
    st.scratch.active = false;
    st.scratch.affordance = null;
  };
  if (!tray) {
    cleanup();
    return;
  }

  if (!st.scratch.isGroup && st.scratch.affordance) {
    const gs = useGardenStore.getState();
    const cultivarId = st.scratch.cultivarId!;
    gs.clearCell(trayId, st.scratch.anchorFromRow, st.scratch.anchorFromCol);
    const aff = st.scratch.affordance;
    if (aff.kind === 'all') gs.fillTray(trayId, cultivarId, { replace: true });
    else if (aff.kind === 'row') gs.fillRow(trayId, aff.row, cultivarId, { replace: true });
    else gs.fillColumn(trayId, aff.col, cultivarId, { replace: true });
    cleanup();
    return;
  }

  const oEnd = trayWorldOrigin(tray, ss);
  // Cross-tray drop on commit: single-seedling drags only.
  const crossHitEnd = !st.scratch.isGroup
    ? hitTestCellAcrossTrays(ss.trays, st.worldX, st.worldY, (t) => trayWorldOrigin(t, ss))
    : null;
  if (!st.scratch.isGroup && crossHitEnd && crossHitEnd.trayId !== trayId) {
    const destTray = ss.trays.find((t) => t.id === crossHitEnd.trayId);
    if (destTray) {
      const destSlot = destTray.slots[crossHitEnd.row * destTray.cols + crossHitEnd.col];
      if (destSlot.state === 'empty') {
        useGardenStore.getState().moveSeedlingsAcrossTrays([
          {
            seedlingId: st.scratch.draggedId!,
            fromTrayId: trayId,
            toTrayId: crossHitEnd.trayId,
            toRow: crossHitEnd.row,
            toCol: crossHitEnd.col,
          },
        ]);
      }
      cleanup();
      return;
    }
  }
  const cell = hitTestCellInches(tray, st.worldX - oEnd.x, st.worldY - oEnd.y);
  if (st.scratch.isGroup) {
    if (!cell) {
      cleanup();
      return;
    }
    const dr = cell.row - st.scratch.anchorFromRow;
    const dc = cell.col - st.scratch.anchorFromCol;
    if (dr === 0 && dc === 0) {
      cleanup();
      return;
    }
    const groupSeedlings = st.scratch.groupIds
      .map((id) => ss.seedlings.find((s) => s.id === id))
      .filter((s): s is Seedling => !!s && s.trayId === tray.id && s.row != null && s.col != null);
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
      return;
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
    return;
  }

  if (!cell) {
    useGardenStore.getState().clearCell(trayId, st.scratch.anchorFromRow, st.scratch.anchorFromCol);
    cleanup();
    return;
  }
  if (cell.row === st.scratch.anchorFromRow && cell.col === st.scratch.anchorFromCol) {
    cleanup();
    return;
  }
  useGardenStore
    .getState()
    .moveSeedling(trayId, st.scratch.anchorFromRow, st.scratch.anchorFromCol, cell.row, cell.col);
  cleanup();
  return;
}

function onDragCancel(st: MoveDragState): void {
  setFillGhost(null);
  setMoveGhost(null);
  useUiStore.getState().setHiddenSeedlingIds([]);
  st.scratch.active = false;
  st.scratch.affordance = null;
}

/**
 * Drag an existing seedling (or the whole selection) to new cells.
 *
 * Claims a press that lands on a seedling while no palette drag-to-sow is in
 * flight; otherwise declines, so the router can offer the drag to the fill and
 * marquee gestures. `scratchRef` is shared with the gutter overlay, which draws
 * from the live scratch every frame.
 */
export function createSeedlingMoveGesture(scratchRef: {
  current: SeedlingMoveScratch;
}): NurseryDragGesture {
  return {
    id: 'seedling-move',
    start(p: GesturePoint): NurseryDragHandle | null {
      // A palette drag-to-sow is active; defer to the sow / fill gestures.
      if (useUiStore.getState().seedDragCultivarId) return null;
      const hit = findSeedlingAt(p.worldX, p.worldY);
      if (!hit) return null; // empty press — the marquee's

      const ui = useUiStore.getState();
      // Selection follows the press: shift extends, a plain press selects the
      // seedling unless it is already part of the selection.
      if (p.shift) {
        if (!ui.selectedIds.includes(hit.seedling.id)) ui.addToSelection(hit.seedling.id);
      } else if (!ui.selectedIds.includes(hit.seedling.id)) {
        ui.select(hit.seedling.id);
      }

      const sel = useUiStore.getState().selectedIds;
      const isAnchorSelected = sel.includes(hit.seedling.id);
      const groupIds = isAnchorSelected && sel.length > 1 ? sel.slice() : [hit.seedling.id];

      const scratch = initScratch();
      scratch.draggedId = hit.seedling.id;
      scratch.trayId = hit.tray.id;
      scratch.isGroup = groupIds.length > 1;
      scratch.groupIds = groupIds;
      scratch.anchorFromRow = hit.seedling.row ?? 0;
      scratch.anchorFromCol = hit.seedling.col ?? 0;
      scratch.startWorld = { x: p.worldX, y: p.worldY };
      scratch.currentWorld = { x: p.worldX, y: p.worldY };
      scratch.cultivarId = hit.seedling.cultivarId;
      // Live from the press: hide every dragged seedling so the canvas shows
      // movement instead of a copy sitting under the ghost.
      scratch.active = true;
      scratchRef.current = scratch;
      useUiStore.getState().setHiddenSeedlingIds(scratch.groupIds);

      const st: MoveDragState = {
        scratch,
        worldX: p.worldX,
        worldY: p.worldY,
        modifiers: { shift: p.shift, alt: p.alt },
      };
      const sync = (m: GesturePoint) => {
        st.worldX = m.worldX;
        st.worldY = m.worldY;
        st.modifiers = { shift: m.shift, alt: m.alt };
      };

      return {
        move(m) {
          sync(m);
          onDragMove(st);
        },
        end(m) {
          sync(m);
          onDragEnd(st);
          scratchRef.current = initScratch();
        },
        cancel() {
          onDragCancel(st);
          scratchRef.current = initScratch();
        },
      };
    },
  };
}

/**
 * The seedling-move gesture plus the gutter-affordance overlay it drives: the
 * canvas hands the gesture to the nursery router and the overlay to the
 * nursery tool.
 */
export function useSeedlingMoveGesture(): {
  gesture: NurseryDragGesture;
  overlay: RenderLayer<unknown>;
  /** Live drag scratch, shared with the overlay. Exposed for tests and for any
   *  consumer that needs to see what the gesture is doing mid-flight. */
  scratchRef: { current: SeedlingMoveScratch };
} {
  // Stable mutable mirror so the overlay's draw closure (defined once) sees
  // current scratch values across renders without re-creating the layer.
  const scratchRef = useRef<SeedlingMoveScratch>(initScratch());

  const overlay = useMemo<RenderLayer<unknown>>(
    () => ({
      id: 'seedling-move-gutter-overlay',
      label: 'Seedling Gutter Affordances',
      space: 'screen',
      draw(_data, view: View, _dims: Dims): DrawCommand[] {
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
        if (!seedlingDragActive && !paletteDragActive) return [];

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
          // Palette drag: prefer the tray referenced by the live fill putative
          // (`seedFillTrayDrag` publishes here during a palette drag); fall
          // back to the active tray.
          const dp = ui.dragPreview;
          const fp =
            dp && dp.kind === SEED_FILL_TRAY_DRAG_KIND ? (dp.putative as SeedFillPutative) : null;
          trayId = fp?.trayId ?? ui.currentTrayId;
          if (fp && (fp.scope === 'all' || fp.scope === 'row' || fp.scope === 'col')) {
            affKind = fp.scope;
            if (fp.scope === 'row' || fp.scope === 'col') affIndex = fp.index;
          }
        }
        if (!trayId) return [];
        const tray = useGardenStore.getState().garden.nursery.trays.find((t) => t.id === trayId);
        if (!tray) return [];
        const scale = view.scale.x;
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
        const cmds: DrawCommand[] = [];
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
          cmds.push(
            ...markerCommands(
              cx,
              cy,
              markerLen * lenScale,
              markerW * widthScale,
              rotation,
              isHover ? hoverFill : baseFill,
              baseStroke,
            ),
          );
        }
        return cmds;
      },
    }),
    [],
  );

  const gesture = useMemo(() => createSeedlingMoveGesture(scratchRef), []);
  return { gesture, overlay, scratchRef };
}
