import { beforeEach, describe, expect, it } from 'vitest';
import { createPlantingMoveAdapter } from './plantingMove';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { createTransformOp } from '@orochi235/weasel';

describe('plantingMoveAdapter', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  function setup() {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 5, y: 5, width: 4, length: 4 });
    const bed = useGardenStore.getState().garden.structures[0];
    useGardenStore.getState().addPlanting({ parentId: bed.id, x: 1, y: 1, cultivarId: 'tomato' });
    const planting = useGardenStore.getState().garden.plantings[0];
    return { bed, planting };
  }

  it('getPose returns world-coordinate pose', () => {
    const { bed, planting } = setup();
    const a = createPlantingMoveAdapter();
    expect(a.getPose(planting.id)).toEqual({ x: bed.x + planting.x, y: bed.y + planting.y });
  });

  it('getParent returns the planting parentId', () => {
    const { bed, planting } = setup();
    const a = createPlantingMoveAdapter();
    expect(a.getParent(planting.id)).toBe(bed.id);
  });

  it('applyBatch wraps mutations in a checkpoint', () => {
    const { planting } = setup();
    const a = createPlantingMoveAdapter();
    // setup() pushes history via addStructure/addPlanting; drain it so we start
    // from a known-empty undo stack and can verify applyBatch adds an entry.
    useGardenStore.getState().loadGarden(useGardenStore.getState().garden);
    const before = useGardenStore.getState().canUndo();
    a.applyBatch!(
      [createTransformOp<{ x: number; y: number }>({ id: planting.id, from: { x: 0, y: 0 }, to: { x: 10, y: 10 } })],
      'Move',
    );
    expect(useGardenStore.getState().canUndo()).toBe(true);
    expect(before).toBe(false);
  });

  it('setPose stores parent-relative coords', () => {
    const { bed, planting } = setup();
    const a = createPlantingMoveAdapter();
    a.setPose(planting.id, { x: bed.x + 2, y: bed.y + 3 });
    const updated = useGardenStore.getState().garden.plantings.find((p) => p.id === planting.id)!;
    expect(updated.x).toBe(2);
    expect(updated.y).toBe(3);
  });

  it('setParent rewrites parent and converts pose to new parent-relative coords', () => {
    const { planting } = setup();
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 20, y: 20, width: 4, length: 4 });
    const bed2 = useGardenStore.getState().garden.structures[1];
    const a = createPlantingMoveAdapter();
    a.setParent(planting.id, bed2.id);
    const updated = useGardenStore.getState().garden.plantings.find((p) => p.id === planting.id)!;
    expect(updated.parentId).toBe(bed2.id);
  });

  it('removeObject removes the planting', () => {
    const { planting } = setup();
    const a = createPlantingMoveAdapter();
    a.removeObject(planting.id);
    expect(useGardenStore.getState().garden.plantings).toHaveLength(0);
  });

  it('insertObject re-creates a deleted planting (round-trip)', () => {
    const { planting } = setup();
    const a = createPlantingMoveAdapter();
    const snapshot = useGardenStore.getState().garden.plantings.find((p) => p.id === planting.id)!;
    a.removeObject(planting.id);
    a.insertObject(snapshot);
    const restored = useGardenStore.getState().garden.plantings.find((p) => p.id === planting.id)!;
    expect(restored.x).toBe(snapshot.x);
    expect(restored.y).toBe(snapshot.y);
    expect(restored.parentId).toBe(snapshot.parentId);
  });
});
