import { beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createAreaSelectAdapter } from './areaSelect';
import { createSetSelectionOp } from '@/canvas-kit';

describe('createAreaSelectAdapter', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });

  it('hitTestArea returns ids of zones intersecting the rect', () => {
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().addZone({ x: 100, y: 100, width: 4, height: 4 });
    const a = createAreaSelectAdapter();
    const ids = a.hitTestArea({ x: -1, y: -1, width: 6, height: 6 });
    const z0 = useGardenStore.getState().garden.zones[0].id;
    const z1 = useGardenStore.getState().garden.zones[1].id;
    expect(ids).toContain(z0);
    expect(ids).not.toContain(z1);
  });

  it('getSelection returns useUiStore.selectedIds', () => {
    useUiStore.getState().setSelection(['a', 'b']);
    const a = createAreaSelectAdapter();
    expect(a.getSelection()).toEqual(['a', 'b']);
  });

  it('setSelection writes through to useUiStore', () => {
    const a = createAreaSelectAdapter();
    a.setSelection(['x', 'y']);
    expect(useUiStore.getState().selectedIds).toEqual(['x', 'y']);
  });

  it('applyOps runs the SetSelectionOp without producing a garden history entry', () => {
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 4, height: 4 });
    // Drain addZone's history entry so undo only reflects applyOps (or lack thereof).
    useGardenStore.getState().loadGarden(useGardenStore.getState().garden);
    const before = useGardenStore.getState().garden;
    const a = createAreaSelectAdapter();
    a.applyOps([createSetSelectionOp({ from: [], to: ['z'] })]);
    expect(useUiStore.getState().selectedIds).toEqual(['z']);
    // Garden state unchanged → undo is a no-op (garden returns to same shape).
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.zones.length).toBe(before.zones.length);
  });
});
