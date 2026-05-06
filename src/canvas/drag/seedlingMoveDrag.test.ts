import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createTray } from '../../model/seedStarting';
import {
  createSeedlingMoveDrag,
  SEEDLING_MOVE_DRAG_KIND,
  type SeedlingMovePutative,
} from './seedlingMoveDrag';

interface CtxCall { fn: string; strokeStyle?: string }

function fakeCtx() {
  const calls: CtxCall[] = [];
  let fillStyle = '';
  let strokeStyle = '';
  let lineWidth = 0;
  let globalAlpha = 1;
  const stack: Array<{ fillStyle: string; strokeStyle: string; lineWidth: number; globalAlpha: number }> = [];
  const ctx = {
    save() { stack.push({ fillStyle, strokeStyle, lineWidth, globalAlpha }); calls.push({ fn: 'save' }); },
    restore() {
      const s = stack.pop();
      if (s) { fillStyle = s.fillStyle; strokeStyle = s.strokeStyle; lineWidth = s.lineWidth; globalAlpha = s.globalAlpha; }
      calls.push({ fn: 'restore' });
    },
    translate() { calls.push({ fn: 'translate' }); },
    beginPath() { calls.push({ fn: 'beginPath' }); },
    arc() { calls.push({ fn: 'arc' }); },
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() { calls.push({ fn: 'fill' }); },
    stroke() { calls.push({ fn: 'stroke', strokeStyle }); },
    setLineDash() {},
    fillRect() { calls.push({ fn: 'fillRect' }); },
    strokeRect() { calls.push({ fn: 'strokeRect' }); },
    get fillStyle() { return fillStyle; },
    set fillStyle(v: string) { fillStyle = v; },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(v: string) { strokeStyle = v; },
    get lineWidth() { return lineWidth; },
    set lineWidth(v: number) { lineWidth = v; },
    get globalAlpha() { return globalAlpha; },
    set globalAlpha(v: number) { globalAlpha = v; },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

function seedTray(): string {
  const garden = blankGarden();
  const tray = createTray({ rows: 4, cols: 4, cellSize: 'small', label: 'T' });
  garden.seedStarting = { trays: [tray], seedlings: [] };
  useGardenStore.getState().loadGarden(garden);
  return tray.id;
}

describe('seedlingMoveDrag', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });
  afterEach(() => {
    useUiStore.getState().setDragPreview(null);
  });

  it('exposes the expected kind constant', () => {
    const drag = createSeedlingMoveDrag();
    expect(drag.kind).toBe(SEEDLING_MOVE_DRAG_KIND);
    expect(SEEDLING_MOVE_DRAG_KIND).toBe('eric-seedling-move');
  });

  it('compute returns null for empty cells', () => {
    const drag = createSeedlingMoveDrag();
    expect(drag.compute({ trayId: 't', feasible: true, cells: [] })).toBeNull();
  });

  it('compute returns null when trayId is empty', () => {
    const drag = createSeedlingMoveDrag();
    expect(
      drag.compute({
        trayId: '',
        feasible: true,
        cells: [{ row: 0, col: 0, cultivarId: 'tomato', bumped: false }],
      }),
    ).toBeNull();
  });

  it('compute echoes a populated input into a putative', () => {
    const drag = createSeedlingMoveDrag();
    const out = drag.compute({
      trayId: 't1',
      feasible: false,
      cells: [
        { row: 0, col: 0, cultivarId: 'tomato', bumped: false },
        { row: 1, col: 2, cultivarId: 'basil', bumped: true },
      ],
    });
    expect(out).toEqual({
      trayId: 't1',
      feasible: false,
      cells: [
        { row: 0, col: 0, cultivarId: 'tomato', bumped: false },
        { row: 1, col: 2, cultivarId: 'basil', bumped: true },
      ],
    });
  });

  it('renderPreview is a no-op when tray is not found', () => {
    const drag = createSeedlingMoveDrag();
    const { ctx, calls } = fakeCtx();
    drag.renderPreview(
      ctx,
      {
        trayId: 'missing-tray',
        feasible: true,
        cells: [{ row: 0, col: 0, cultivarId: 'tomato', bumped: false }],
      },
      { x: 0, y: 0, scale: 30 },
    );
    expect(calls.find((c) => c.fn === 'arc')).toBeUndefined();
  });

  it('renderPreview is a no-op for empty cells (no tray translate)', () => {
    const trayId = seedTray();
    const drag = createSeedlingMoveDrag();
    const { ctx, calls } = fakeCtx();
    drag.renderPreview(
      ctx,
      { trayId, feasible: true, cells: [] },
      { x: 0, y: 0, scale: 30 },
    );
    expect(calls.find((c) => c.fn === 'translate')).toBeUndefined();
  });

  it('renderPreview draws a feasible move ghost without a red ring', () => {
    const trayId = seedTray();
    const drag = createSeedlingMoveDrag();
    const { ctx, calls } = fakeCtx();
    const putative: SeedlingMovePutative = {
      trayId,
      feasible: true,
      cells: [{ row: 1, col: 2, cultivarId: 'tomato', bumped: false }],
    };
    drag.renderPreview(ctx, putative, { x: 0, y: 0, scale: 30 });
    // Cultivar icon body translate present, but no goldenrod (#d4a55a) or red
    // rejection ring stroke. (renderPlant may stroke its glyph internally —
    // we only filter for the move-drag's own ring colors here.)
    expect(calls.filter((c) => c.fn === 'translate').length).toBeGreaterThan(0);
    const ringStrokes = calls.filter(
      (c) => c.fn === 'stroke' && (c.strokeStyle === '#d4a55a' || c.strokeStyle === 'rgba(220, 60, 60, 0.7)'),
    );
    expect(ringStrokes).toHaveLength(0);
  });

  it('renderPreview does not stroke a goldenrod ring on bumped cells (bumped visual removed)', () => {
    const trayId = seedTray();
    const drag = createSeedlingMoveDrag();
    const { ctx, calls } = fakeCtx();
    drag.renderPreview(
      ctx,
      {
        trayId,
        feasible: true,
        cells: [{ row: 0, col: 0, cultivarId: 'tomato', bumped: true }],
      },
      { x: 0, y: 0, scale: 30 },
    );
    const goldStrokes = calls.filter((c) => c.fn === 'stroke' && c.strokeStyle === '#d4a55a');
    expect(goldStrokes.length).toBe(0);
  });

  it('renderPreview overlays a red infeasibility ring on every cell when !feasible', () => {
    const trayId = seedTray();
    const drag = createSeedlingMoveDrag();
    const { ctx, calls } = fakeCtx();
    drag.renderPreview(
      ctx,
      {
        trayId,
        feasible: false,
        cells: [
          { row: 0, col: 0, cultivarId: 'tomato', bumped: false },
          { row: 1, col: 1, cultivarId: 'tomato', bumped: false },
        ],
      },
      { x: 0, y: 0, scale: 30 },
    );
    // Two infeasibility-ring strokes (one per cell), regardless of bumped.
    const redStrokes = calls.filter(
      (c) => c.fn === 'stroke' && c.strokeStyle === 'rgba(220, 60, 60, 0.7)',
    );
    expect(redStrokes.length).toBe(2);
  });

  it('commit is a no-op (state mutation lives in useSeedlingMoveTool.drag.onEnd)', () => {
    const drag = createSeedlingMoveDrag();
    const beforeGarden = useGardenStore.getState().garden;
    const beforeSel = useUiStore.getState().selectedIds;
    drag.commit({
      trayId: 't',
      feasible: true,
      cells: [{ row: 0, col: 0, cultivarId: 'tomato', bumped: false }],
    });
    expect(useGardenStore.getState().garden).toBe(beforeGarden);
    expect(useUiStore.getState().selectedIds).toBe(beforeSel);
  });

  it('read returns a default-shaped input (controller-unused)', () => {
    const drag = createSeedlingMoveDrag();
    const out = drag.read(
      { clientX: 0, clientY: 0, modifiers: { shift: false, alt: false, ctrl: false, meta: false } },
      { container: document.createElement('div'), view: { x: 0, y: 0, scale: 1 } },
    );
    expect(out).toEqual({ trayId: '', feasible: true, cells: [] });
  });
});
