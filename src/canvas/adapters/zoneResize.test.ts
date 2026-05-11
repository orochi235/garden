import { describe, expect, it, beforeEach } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { createZoneResizeAdapter } from './zoneResize';
import { createTransformOp } from '@orochi235/weasel';

describe('createZoneResizeAdapter', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useGardenStore.getState().addZone({ x: 1, y: 2, width: 4, length: 5 });
  });

  it('getPose returns x/y/width/height', () => {
    const z = useGardenStore.getState().garden.zones[0];
    const a = createZoneResizeAdapter();
    expect(a.getPose(z.id)).toEqual({ x: 1, y: 2, width: 4, length: 5 });
  });

  it('getNode returns the zone', () => {
    const z = useGardenStore.getState().garden.zones[0];
    const a = createZoneResizeAdapter();
    expect(a.getNode(z.id)?.id).toBe(z.id);
    expect(a.getNode('missing')).toBeUndefined();
  });

  it('applyBatch checkpoints + applies; undo restores', () => {
    const z = useGardenStore.getState().garden.zones[0];
    const a = createZoneResizeAdapter();
    useGardenStore.getState().loadGarden(useGardenStore.getState().garden);
    a.applyBatch!(
      [createTransformOp({ id: z.id, from: { x: z.x, y: z.y, width: z.width, length: z.length }, to: { x: z.x, y: z.y, width: 10, length: 10 } })],
      'Resize',
    );
    expect(useGardenStore.getState().garden.zones[0].width).toBe(10);
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.zones[0].width).toBe(4);
  });
});
