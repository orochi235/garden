import { describe, expect, it, beforeEach } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { createStructureResizeAdapter } from './structureResize';
import { createTransformOp } from '@orochi235/weasel';

describe('createStructureResizeAdapter', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useGardenStore.getState().addStructure({ type: 'bed', x: 0, y: 0, width: 4, height: 4 });
  });

  it('getPose returns dimensions', () => {
    const s = useGardenStore.getState().garden.structures[0];
    const a = createStructureResizeAdapter();
    expect(a.getPose(s.id)).toEqual({ x: 0, y: 0, width: 4, height: 4 });
  });

  it('getObject returns the structure', () => {
    const s = useGardenStore.getState().garden.structures[0];
    const a = createStructureResizeAdapter();
    expect(a.getObject(s.id)?.id).toBe(s.id);
    expect(a.getObject('missing')).toBeUndefined();
  });

  it('applyBatch checkpoints + undo restores', () => {
    const s = useGardenStore.getState().garden.structures[0];
    const a = createStructureResizeAdapter();
    useGardenStore.getState().loadGarden(useGardenStore.getState().garden);
    a.applyBatch!(
      [createTransformOp({
        id: s.id,
        from: { x: s.x, y: s.y, width: s.width, height: s.height },
        to: { x: 0, y: 0, width: 8, height: 8 },
      })],
      'Resize',
    );
    expect(useGardenStore.getState().garden.structures[0].width).toBe(8);
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures[0].width).toBe(4);
  });
});
