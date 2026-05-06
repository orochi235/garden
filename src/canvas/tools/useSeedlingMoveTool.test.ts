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
 *     markers receive different fill colors).
 */

interface DrawOp {
  kind: 'fill' | 'stroke' | 'fillRect' | 'strokeRect';
  fillStyle?: string;
  strokeStyle?: string;
}

function makeFakeCtx(): { ctx: CanvasRenderingContext2D; ops: DrawOp[]; fills: string[] } {
  const ops: DrawOp[] = [];
  const fills: string[] = [];
  const stack: { fillStyle: string; strokeStyle: string }[] = [];
  let fillStyle = '';
  let strokeStyle = '';
  const ctx = {
    save() { stack.push({ fillStyle, strokeStyle }); },
    restore() { const s = stack.pop(); if (s) { fillStyle = s.fillStyle; strokeStyle = s.strokeStyle; } },
    translate() {},
    rotate() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    arc() {},
    setLineDash() {},
    fill() { ops.push({ kind: 'fill', fillStyle }); fills.push(fillStyle); },
    stroke() { ops.push({ kind: 'stroke', strokeStyle }); },
    fillRect() { ops.push({ kind: 'fillRect', fillStyle }); fills.push(fillStyle); },
    strokeRect() { ops.push({ kind: 'strokeRect', strokeStyle }); },
    get fillStyle() { return fillStyle; },
    set fillStyle(v: string) { fillStyle = v; },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(v: string) { strokeStyle = v; },
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, ops, fills };
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

    const { ctx, ops } = makeFakeCtx();
    tool.overlay!.draw(ctx, undefined as never, { x: 0, y: 0, scale: 50 });
    expect(ops).toHaveLength(0);
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

    const { ctx, fills } = makeFakeCtx();
    tool.overlay!.draw(ctx, undefined as never, { x: 0, y: 0, scale: 50 });
    // Markers were drawn — at least one fill happened with the base marker color.
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

    const { ctx, fills } = makeFakeCtx();
    tool.overlay!.draw(ctx, undefined as never, { x: 0, y: 0, scale: 50 });
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

    const { ctx, fills } = makeFakeCtx();
    tool.overlay!.draw(ctx, undefined as never, { x: 0, y: 0, scale: 50 });
    // Group drags suppress the gutter overlay (single-seedling-only feature).
    expect(fills.some((f) => f === '#d4a55a')).toBe(false);
    expect(fills.some((f) => f === '#ffd27a')).toBe(false);
  });

  it('overlay draws when a palette drag is active even without a seedling drag', () => {
    const tray = createTray({ rows: 2, cols: 3, cellSize: 'medium', label: 't' });
    useGardenStore.getState().addTray(tray);
    useUiStore.getState().setCurrentTrayId(tray.id);

    const { result } = renderTool();
    const tool = result.current;

    // Arm a palette drag — overlay's secondary trigger.
    useUiStore.getState().setSeedDragCultivarId('tomato');

    const { ctx, fills } = makeFakeCtx();
    tool.overlay!.draw(ctx, undefined as never, { x: 0, y: 0, scale: 50 });
    expect(fills.some((f) => f === '#d4a55a')).toBe(true);
  });
});
