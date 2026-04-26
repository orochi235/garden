import { beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from './gardenStore';
import { useUiStore } from './uiStore';

describe('commit vs live updates', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });

  it('live updateStructure is NOT undoable on its own', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;

    // Live update (no history push)
    useGardenStore.getState().updateStructure(id, { x: 10 });
    expect(useGardenStore.getState().garden.structures[0].x).toBe(10);

    // Undo should revert to before addStructure, not before updateStructure
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
  });

  it('commitStructureUpdate IS undoable', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;

    // Commit update (with history push)
    useGardenStore.getState().commitStructureUpdate(id, { x: 10 });
    expect(useGardenStore.getState().garden.structures[0].x).toBe(10);

    // Undo should revert the commit, keeping the structure at x=0
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
    expect(useGardenStore.getState().garden.structures[0].x).toBe(0);
  });

  it('commitZoneUpdate IS undoable', () => {
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 5, height: 5 });
    const id = useGardenStore.getState().garden.zones[0].id;

    useGardenStore.getState().commitZoneUpdate(id, { label: 'Herb Garden' });
    expect(useGardenStore.getState().garden.zones[0].label).toBe('Herb Garden');

    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.zones[0].label).toBe('zone');
  });

  it('commitPlantingUpdate IS undoable', () => {
    useGardenStore.getState().addZone({ x: 0, y: 0, width: 5, height: 5 });
    const zoneId = useGardenStore.getState().garden.zones[0].id;
    useGardenStore.getState().addPlanting({ parentId: zoneId, x: 1, y: 1, cultivarId: 'tomato' });
    const id = useGardenStore.getState().garden.plantings[0].id;

    useGardenStore.getState().commitPlantingUpdate(id, { cultivarId: 'basil' });
    expect(useGardenStore.getState().garden.plantings[0].cultivarId).toBe('basil');

    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.plantings[0].cultivarId).toBe('tomato');
  });

  it('commit respects layer lock', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().setLayerLocked('structures', true);

    useGardenStore.getState().commitStructureUpdate(id, { x: 10 });
    expect(useGardenStore.getState().garden.structures[0].x).toBe(0);
  });
});
