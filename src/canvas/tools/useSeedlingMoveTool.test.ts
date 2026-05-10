import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ToolCtx } from '@orochi235/weasel';
import {
  useSeedlingMoveTool,
  type SeedlingMoveScratch,
} from './useSeedlingMoveTool';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createTray, trayInteriorOffsetIn } from '../../model/seedStarting';
import { createSeedStartingSceneAdapter } from '../adapters/seedStartingScene';
import { getTrayDropTargets, hitTrayDropTarget } from '../layouts/trayDropTargets';

/**
 * Tests cover the gutter-affordance overlay that this tool owns (per the
 * gutter-affordance ADR, drag-spread markers live as a tool-owned overlay
 * rather than in `trayLayersWorld`). We exercise:
 *   - visibility gating: overlay only draws while a single-seedling drag is
 *     active (or a palette-drag is active);
 *   - hover state: `scratch.affordance` written by `drag.onMove` flows into
 *     the overlay rendering (verified by checking that hovered/non-hovered
 *     markers receive different fill colors in the DrawCommand tree).
 */

type DrawCommand = { kind: string; fill?: { fill: string; color: string }; stroke?: { paint: { color: string } }; children?: DrawCommand[]; alpha?: number; transform?: unknown };

function collectFills(cmds: DrawCommand[]): string[] {
  const fills: string[] = [];
  for (const cmd of cmds) {
    if (cmd.fill) fills.push(cmd.fill.color);
    if (cmd.children) fills.push(...collectFills(cmd.children));
  }
  return fills;
}

function makePointerDown(): PointerEvent {
  const e = new Event('pointerdown') as PointerEvent;
  Object.assign(e, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
  return e;
}

function makePointerMove(): PointerEvent {
  const e = new Event('pointermove') as PointerEvent;
  Object.assign(e, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
  return e;
}

function makeMoveCtx(
  worldX: number,
  worldY: number,
  scratch: SeedlingMoveScratch,
): ToolCtx<SeedlingMoveScratch> {
  return {
    worldX,
    worldY,
    modifiers: { alt: false, shift: false, meta: false, ctrl: false, space: false },
    selection: {} as never,
    adapter: null,
    applyBatch: () => {},
    view: { x: 0, y: 0, scale: 50 },
    setView: () => {},
    canvasRect: new DOMRect(0, 0, 800, 600),
    scratch,
  };
}

function renderTool() {
  const adapter = createSeedStartingSceneAdapter();
  return renderHook(() => useSeedlingMoveTool(adapter));
}

describe('useSeedlingMoveTool gutter-affordance overlay', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('overlay draws nothing when no drag is in flight', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);

    const { result } = renderTool();
    const tool = result.current;
    expect(tool.overlay).toBeDefined();

    const cmds = tool.overlay!.draw(undefined as never, { x: 0, y: 0, scale: 50 }, { width: 800, height: 600 });
    expect(cmds).toHaveLength(0);
  });

  it('overlay draws gutter markers when a single-seedling drag is active', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);
    // Sow a seedling so we have something to drag.
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'tomato');
    const seedling = useGardenStore.getState().garden.seedStarting.seedlings[0];

    const { result } = renderTool();
    const tool = result.current;

    // Simulate drag-start by driving onDown / onStart at the seedling's center.
    const off = trayInteriorOffsetIn(tray);
    const cellCx = off.x + 0.5 * tray.cellPitchIn;
    const cellCy = off.y + 0.5 * tray.cellPitchIn;

    // Allocate scratch via the tool's initScratch (also wires up the ref mirror).
    const scratch = tool.initScratch!() as SeedlingMoveScratch;
    const ctxA = makeMoveCtx(cellCx, cellCy, scratch);
    tool.pointer!.onDown!(makePointerDown(), ctxA);
    tool.drag!.onStart!(makePointerDown(), ctxA);

    // Sanity: scratch reflects an active single-seedling drag.
    expect(scratch.active).toBe(true);
    expect(scratch.isGroup).toBe(false);
    expect(scratch.draggedId).toBe(seedling.id);

    const cmds = tool.overlay!.draw(undefined as never, { x: 0, y: 0, scale: 50 }, { width: 800, height: 600 });
    const fills = collectFills(cmds as DrawCommand[]);
    // Markers were drawn — at least one fill with the base marker color.
    expect(fills.some((f) => f === '#d4a55a')).toBe(true);
    // No marker is hovered yet → no hover-fill color emitted.
    expect(fills.some((f) => f === '#ffd27a')).toBe(false);
  });

  it('hovered marker uses hover fill when scratch.affordance points at it', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'tomato');

    const { result } = renderTool();
    const tool = result.current;

    const off = trayInteriorOffsetIn(tray);
    const cellCx = off.x + 0.5 * tray.cellPitchIn;
    const cellCy = off.y + 0.5 * tray.cellPitchIn;

    const scratch = tool.initScratch!() as SeedlingMoveScratch;
    const ctxA = makeMoveCtx(cellCx, cellCy, scratch);
    tool.pointer!.onDown!(makePointerDown(), ctxA);
    tool.drag!.onStart!(makePointerDown(), ctxA);

    // Drive onMove into the row-0 gutter region to set scratch.affordance.
    const targets = getTrayDropTargets(tray);
    const rowTarget = targets.find((t) => t.meta.kind === 'row' && t.meta.row === 0);
    expect(rowTarget).toBeDefined();
    const rb = rowTarget!.hitBounds!;
    const inGutterX = rb.x + rb.width / 2;
    const inGutterY = rb.y + rb.height / 2;
    // Sanity-check the hit-tester agrees we're inside.
    expect(hitTrayDropTarget(targets, { x: inGutterX, y: inGutterY })?.meta.kind).toBe('row');

    const ctxMove = makeMoveCtx(inGutterX, inGutterY, scratch);
    tool.drag!.onMove!(makePointerMove(), ctxMove);
    expect(scratch.affordance?.kind).toBe('row');

    const cmds = tool.overlay!.draw(undefined as never, { x: 0, y: 0, scale: 50 }, { width: 800, height: 600 });
    const fills = collectFills(cmds as DrawCommand[]);
    // Both base and hover colors were emitted (row marker hovered, others not).
    expect(fills).toContain('#d4a55a');
    expect(fills).toContain('#ffd27a');
  });

  it('overlay does not draw markers during a multi-seedling (group) drag', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);
    useGardenStore.getState().sowCell(tray.id, 0, 0, 'tomato');
    useGardenStore.getState().sowCell(tray.id, 0, 1, 'tomato');
    const ss = useGardenStore.getState().garden.seedStarting;
    useUiStore.getState().setSelection(ss.seedlings.map((s) => s.id));

    const { result } = renderTool();
    const tool = result.current;
    const off = trayInteriorOffsetIn(tray);
    const cellCx = off.x + 0.5 * tray.cellPitchIn;
    const cellCy = off.y + 0.5 * tray.cellPitchIn;

    const scratch = tool.initScratch!() as SeedlingMoveScratch;
    const ctxA = makeMoveCtx(cellCx, cellCy, scratch);
    tool.pointer!.onDown!(makePointerDown(), ctxA);
    tool.drag!.onStart!(makePointerDown(), ctxA);
    expect(scratch.isGroup).toBe(true);
    expect(scratch.active).toBe(true);

    const cmds = tool.overlay!.draw(undefined as never, { x: 0, y: 0, scale: 50 }, { width: 800, height: 600 });
    const fills = collectFills(cmds as DrawCommand[]);
    // Group drags suppress the gutter overlay (single-seedling-only feature).
    expect(fills.some((f) => f === '#d4a55a')).toBe(false);
    expect(fills.some((f) => f === '#ffd27a')).toBe(false);
  });

  it('cross-tray drag: drop on tray B moves seedling from tray A in one undo step', () => {
    // Two trays — second tray's world origin is non-zero (column-major
    // auto-flow lays it below tray A).
    const a = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 'A' });
    const b = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 'B' });
    useGardenStore.getState().addTray(a);
    useGardenStore.getState().addTray(b);
    useUiStore.getState().setCurrentTrayId(a.id);
    useGardenStore.getState().sowCell(a.id, 0, 0, 'tomato');
    const sId = useGardenStore.getState().garden.seedStarting.seedlings[0].id;
    const ss0 = useGardenStore.getState().garden.seedStarting;
    // World origin for tray B (use the same fn the tool uses).
    const trayBOrigin = (() => {
      // Recompute via the adapter export — column-major auto-flow.
      // Tray A is at (0,0); B sits below it.
      return { x: 0, y: a.heightIn + /* gutter */ 2 };
    })();
    void ss0;

    const { result } = renderTool();
    const tool = result.current;

    // Press on the seedling (tray A cell 0,0).
    const offA = trayInteriorOffsetIn(a);
    const cellA = { x: offA.x + 0.5 * a.cellPitchIn, y: offA.y + 0.5 * a.cellPitchIn };
    const scratch = tool.initScratch!() as SeedlingMoveScratch;
    const ctxDown = makeMoveCtx(cellA.x, cellA.y, scratch);
    tool.pointer!.onDown!(makePointerDown(), ctxDown);
    tool.drag!.onStart!(makePointerDown(), ctxDown);
    expect(scratch.active).toBe(true);
    expect(scratch.isGroup).toBe(false);

    // Drop on tray B cell (1, 1).
    const offB = trayInteriorOffsetIn(b);
    const dropX = trayBOrigin.x + offB.x + 1.5 * b.cellPitchIn;
    const dropY = trayBOrigin.y + offB.y + 1.5 * b.cellPitchIn;
    const ctxEnd = makeMoveCtx(dropX, dropY, scratch);
    tool.drag!.onEnd!(makePointerMove(), ctxEnd);

    // Seedling now lives in tray B.
    const ss = useGardenStore.getState().garden.seedStarting;
    const trayB = ss.trays.find((t) => t.id === b.id)!;
    expect(trayB.slots[1 * trayB.cols + 1].seedlingId).toBe(sId);
    const moved = ss.seedlings.find((s) => s.id === sId)!;
    expect(moved.trayId).toBe(b.id);
    expect(moved.row).toBe(1);
    expect(moved.col).toBe(1);

    // Single undo restores.
    useGardenStore.getState().undo();
    const ss2 = useGardenStore.getState().garden.seedStarting;
    expect(ss2.seedlings.find((s) => s.id === sId)!.trayId).toBe(a.id);
  });

  it('cross-tray drag onto an occupied dest cell is rejected (no state change)', () => {
    const a = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 'A' });
    const b = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 'B' });
    useGardenStore.getState().addTray(a);
    useGardenStore.getState().addTray(b);
    useUiStore.getState().setCurrentTrayId(a.id);
    useGardenStore.getState().sowCell(a.id, 0, 0, 'tomato');
    useGardenStore.getState().sowCell(b.id, 1, 1, 'tomato'); // occupies dest

    const ssBefore = useGardenStore.getState().garden.seedStarting;

    const { result } = renderTool();
    const tool = result.current;

    const offA = trayInteriorOffsetIn(a);
    const cellA = { x: offA.x + 0.5 * a.cellPitchIn, y: offA.y + 0.5 * a.cellPitchIn };
    const scratch = tool.initScratch!() as SeedlingMoveScratch;
    const ctxDown = makeMoveCtx(cellA.x, cellA.y, scratch);
    tool.pointer!.onDown!(makePointerDown(), ctxDown);
    tool.drag!.onStart!(makePointerDown(), ctxDown);

    // Tray B at (0, a.heightIn + 2) per column-major auto-flow.
    const trayBOrigin = { x: 0, y: a.heightIn + 2 };
    const offB = trayInteriorOffsetIn(b);
    const dropX = trayBOrigin.x + offB.x + 1.5 * b.cellPitchIn;
    const dropY = trayBOrigin.y + offB.y + 1.5 * b.cellPitchIn;
    const ctxEnd = makeMoveCtx(dropX, dropY, scratch);
    tool.drag!.onEnd!(makePointerMove(), ctxEnd);

    // Source seedling unchanged.
    const ssAfter = useGardenStore.getState().garden.seedStarting;
    const aSeedling = ssAfter.seedlings.find((s) => s.trayId === a.id);
    expect(aSeedling).toBeDefined();
    expect(aSeedling!.row).toBe(0);
    expect(aSeedling!.col).toBe(0);
    void ssBefore;
  });

  it('within-tray drag still flows through moveSeedling (regression)', () => {
    const a = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 'A' });
    useGardenStore.getState().addTray(a);
    useUiStore.getState().setCurrentTrayId(a.id);
    useGardenStore.getState().sowCell(a.id, 0, 0, 'tomato');
    const sId = useGardenStore.getState().garden.seedStarting.seedlings[0].id;

    const { result } = renderTool();
    const tool = result.current;
    const off = trayInteriorOffsetIn(a);
    const scratch = tool.initScratch!() as SeedlingMoveScratch;
    const ctxDown = makeMoveCtx(off.x + 0.5 * a.cellPitchIn, off.y + 0.5 * a.cellPitchIn, scratch);
    tool.pointer!.onDown!(makePointerDown(), ctxDown);
    tool.drag!.onStart!(makePointerDown(), ctxDown);

    const ctxEnd = makeMoveCtx(off.x + 2.5 * a.cellPitchIn, off.y + 1.5 * a.cellPitchIn, scratch);
    tool.drag!.onEnd!(makePointerMove(), ctxEnd);

    const trayA = useGardenStore.getState().garden.seedStarting.trays[0];
    expect(trayA.slots[1 * trayA.cols + 2].seedlingId).toBe(sId);
    expect(trayA.slots[0].state).toBe('empty');
  });

  it('overlay draws when a palette drag is active even without a seedling drag', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);

    const { result } = renderTool();
    const tool = result.current;

    // Arm a palette drag — overlay's secondary trigger.
    useUiStore.getState().setSeedDragCultivarId('tomato');

    const cmds = tool.overlay!.draw(undefined as never, { x: 0, y: 0, scale: 50 }, { width: 800, height: 600 });
    const fills = collectFills(cmds as DrawCommand[]);
    expect(fills.some((f) => f === '#d4a55a')).toBe(true);
  });
});
