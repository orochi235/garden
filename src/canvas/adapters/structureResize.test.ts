import { describe, expect, it, beforeEach } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { createStructureResizeAdapter } from './structureResize';
import { createTransformOp } from '@orochi235/weasel';

describe('createStructureResizeAdapter', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useGardenStore.getState().addStructure({ type: 'bed', x: 0, y: 0, width: 4, length: 4 });
  });

  it('getPose returns dimensions', () => {
    const s = useGardenStore.getState().garden.structures[0];
    const a = createStructureResizeAdapter();
    expect(a.getPose(s.id)).toEqual({ x: 0, y: 0, width: 4, length: 4 });
  });

  it('getNode returns the structure', () => {
    const s = useGardenStore.getState().garden.structures[0];
    const a = createStructureResizeAdapter();
    expect(a.getNode(s.id)?.id).toBe(s.id);
    expect(a.getNode('missing')).toBeUndefined();
  });

  it('applyBatch checkpoints + undo restores', () => {
    const s = useGardenStore.getState().garden.structures[0];
    const a = createStructureResizeAdapter();
    useGardenStore.getState().loadGarden(useGardenStore.getState().garden);
    a.applyBatch!(
      [createTransformOp({
        id: s.id,
        from: { x: s.x, y: s.y, width: s.width, length: s.length },
        to: { x: 0, y: 0, width: 8, length: 8 },
      })],
      'Resize',
    );
    expect(useGardenStore.getState().garden.structures[0].width).toBe(8);
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures[0].width).toBe(4);
  });
});
