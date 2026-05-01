import { beforeEach, describe, expect, it } from 'vitest';
import { createStructureMoveAdapter } from './structureMove';
import { blankGarden, useGardenStore } from '../../store/gardenStore';

describe('structureMoveAdapter', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('getPose returns structure bounds', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 1, y: 2, width: 4, height: 5 });
    const s = useGardenStore.getState().garden.structures[0];
    const a = createStructureMoveAdapter();
    expect(a.getPose(s.id)).toEqual({ x: 1, y: 2, widthFt: 4, heightFt: 5 });
  });

  it('setPose moves structure x/y only', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 1, y: 2, width: 4, height: 5 });
    const s = useGardenStore.getState().garden.structures[0];
    const a = createStructureMoveAdapter();
    a.setPose(s.id, { x: 10, y: 20, widthFt: 4, heightFt: 5 });
    const u = useGardenStore.getState().garden.structures[0];
    expect(u.x).toBe(10);
    expect(u.y).toBe(20);
    expect(u.width).toBe(4);
  });
});
