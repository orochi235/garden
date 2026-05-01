import { beforeEach, describe, expect, it } from 'vitest';
import { createZoneMoveAdapter } from './zoneMove';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { createTransformOp } from '@/canvas-kit';

describe('zoneMoveAdapter', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  function setup() {
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 5, height: 5 });
    return useGardenStore.getState().garden.zones[0];
  }

  it('getPose returns full zone bounds', () => {
    const z = setup();
    const a = createZoneMoveAdapter();
    expect(a.getPose(z.id)).toEqual({ x: z.x, y: z.y, widthFt: z.width, heightFt: z.height });
  });

  it('setPose updates x and y but preserves width and height', () => {
    const z = setup();
    const a = createZoneMoveAdapter();
    a.setPose(z.id, { x: 10, y: 10, widthFt: 999, heightFt: 999 });
    const updated = useGardenStore.getState().garden.zones[0];
    expect(updated.x).toBe(10);
    expect(updated.y).toBe(10);
    expect(updated.width).toBe(z.width);
    expect(updated.height).toBe(z.height);
  });

  it('applyBatch checkpoints once per batch', () => {
    const z = setup();
    const a = createZoneMoveAdapter();
    useGardenStore.getState().loadGarden(useGardenStore.getState().garden);
    a.applyBatch(
      [createTransformOp({ id: z.id, from: { x: 0, y: 0, widthFt: 5, heightFt: 5 }, to: { x: 3, y: 3, widthFt: 5, heightFt: 5 } })],
      'Move',
    );
    expect(useGardenStore.getState().canUndo()).toBe(true);
  });
});
