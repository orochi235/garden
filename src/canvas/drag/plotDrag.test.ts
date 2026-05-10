import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createPlotDrag, PLOT_DRAG_KIND, type PlotPutative } from './plotDrag';

describe('plotDrag', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });
  afterEach(() => {
    useUiStore.getState().setDragPreview(null);
  });

  it('exposes the expected kind', () => {
    const drag = createPlotDrag();
    expect(drag.kind).toBe(PLOT_DRAG_KIND);
  });

  it('compute returns null when start === current (zero-size)', () => {
    const drag = createPlotDrag();
    expect(
      drag.compute({
        start: { x: 1, y: 1 },
        current: { x: 1, y: 1 },
        entityKind: 'structure',
        color: '#7fb069',
      }),
    ).toBeNull();
  });

  it('compute echoes the input as a putative when populated', () => {
    const drag = createPlotDrag();
    const putative = drag.compute({
      start: { x: 1, y: 2 },
      current: { x: 5, y: 8 },
      entityKind: 'zone',
      color: '#abcdef',
    });
    expect(putative).toEqual({
      start: { x: 1, y: 2 },
      current: { x: 5, y: 8 },
      entityKind: 'zone',
      color: '#abcdef',
    });
  });

  it('renderPreview returns DrawCommands (fill group + stroke) for a non-degenerate rect', () => {
    const drag = createPlotDrag();
    const putative: PlotPutative = {
      start: { x: 2, y: 3 },
      current: { x: 7, y: 9 },
      entityKind: 'zone',
      color: '#7fb069',
    };
    const cmds = drag.renderPreview(putative, { x: 0, y: 0, scale: 50 });
    expect(cmds).toHaveLength(2);
    expect(cmds[0].kind).toBe('group');
    expect(cmds[1].kind).toBe('path');
  });

  it('renderPreview returns [] for a degenerate (zero-size) rectangle', () => {
    const drag = createPlotDrag();
    const cmds = drag.renderPreview(
      {
        start: { x: 5, y: 5 },
        current: { x: 5, y: 5 },
        entityKind: 'structure',
        color: '#000',
      },
      { x: 0, y: 0, scale: 50 },
    );
    expect(cmds).toEqual([]);
  });

  it('commit is a no-op (real commit lives in useInsert.end)', () => {
    const drag = createPlotDrag();
    const before = useGardenStore.getState().garden;
    drag.commit({
      start: { x: 0, y: 0 },
      current: { x: 1, y: 1 },
      entityKind: 'structure',
      color: '#000',
    });
    expect(useGardenStore.getState().garden).toBe(before);
  });
});
