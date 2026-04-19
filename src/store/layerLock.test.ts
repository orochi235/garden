import { beforeEach, describe, expect, it } from 'vitest';
import { useGardenStore } from './gardenStore';
import { useUiStore } from './uiStore';

describe('layerLocked enforcement', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
  });

  describe('structures', () => {
    it('blocks addStructure when locked', () => {
      useUiStore.getState().setLayerLocked('structures', true);
      useGardenStore
        .getState()
        .addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
      expect(useGardenStore.getState().garden.structures).toHaveLength(0);
    });

    it('allows addStructure when unlocked', () => {
      useGardenStore
        .getState()
        .addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
      expect(useGardenStore.getState().garden.structures).toHaveLength(1);
    });

    it('blocks updateStructure when locked', () => {
      useGardenStore
        .getState()
        .addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
      const id = useGardenStore.getState().garden.structures[0].id;
      useUiStore.getState().setLayerLocked('structures', true);
      useGardenStore.getState().updateStructure(id, { x: 10 });
      expect(useGardenStore.getState().garden.structures[0].x).toBe(0);
    });

    it('blocks removeStructure when locked', () => {
      useGardenStore
        .getState()
        .addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
      const id = useGardenStore.getState().garden.structures[0].id;
      useUiStore.getState().setLayerLocked('structures', true);
      useGardenStore.getState().removeStructure(id);
      expect(useGardenStore.getState().garden.structures).toHaveLength(1);
    });
  });

  describe('zones', () => {
    it('blocks addZone when locked', () => {
      useUiStore.getState().setLayerLocked('zones', true);
      useGardenStore.getState().addZone({ x: 0, y: 0, width: 5, height: 5 });
      expect(useGardenStore.getState().garden.zones).toHaveLength(0);
    });

    it('blocks updateZone when locked', () => {
      useGardenStore.getState().addZone({ x: 0, y: 0, width: 5, height: 5 });
      const id = useGardenStore.getState().garden.zones[0].id;
      useUiStore.getState().setLayerLocked('zones', true);
      useGardenStore.getState().updateZone(id, { x: 10 });
      expect(useGardenStore.getState().garden.zones[0].x).toBe(0);
    });

    it('blocks removeZone when locked', () => {
      useGardenStore.getState().addZone({ x: 0, y: 0, width: 5, height: 5 });
      const id = useGardenStore.getState().garden.zones[0].id;
      useUiStore.getState().setLayerLocked('zones', true);
      useGardenStore.getState().removeZone(id);
      expect(useGardenStore.getState().garden.zones).toHaveLength(1);
    });
  });

  describe('plantings', () => {
    it('blocks addPlanting when locked', () => {
      useGardenStore.getState().addZone({ x: 0, y: 0, width: 5, height: 5 });
      const zoneId = useGardenStore.getState().garden.zones[0].id;
      useUiStore.getState().setLayerLocked('plantings', true);
      useGardenStore.getState().addPlanting({ zoneId, x: 1, y: 1, name: 'Tomato' });
      expect(useGardenStore.getState().garden.plantings).toHaveLength(0);
    });

    it('blocks removePlanting when locked', () => {
      useGardenStore.getState().addZone({ x: 0, y: 0, width: 5, height: 5 });
      const zoneId = useGardenStore.getState().garden.zones[0].id;
      useGardenStore.getState().addPlanting({ zoneId, x: 1, y: 1, name: 'Tomato' });
      const plantId = useGardenStore.getState().garden.plantings[0].id;
      useUiStore.getState().setLayerLocked('plantings', true);
      useGardenStore.getState().removePlanting(plantId);
      expect(useGardenStore.getState().garden.plantings).toHaveLength(1);
    });
  });

  describe('hit testing', () => {
    it('blocks hit test on locked layer', async () => {
      const { hitTestObjects } = await import('../canvas/hitTest');
      useGardenStore
        .getState()
        .addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
      useUiStore.getState().setLayerLocked('structures', true);
      const hit = hitTestObjects(
        2,
        2,
        useGardenStore.getState().garden.structures,
        [],
        'structures',
      );
      expect(hit).toBeNull();
    });

    it('allows hit test on unlocked layer', async () => {
      const { hitTestObjects } = await import('../canvas/hitTest');
      useGardenStore
        .getState()
        .addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
      const hit = hitTestObjects(
        2,
        2,
        useGardenStore.getState().garden.structures,
        [],
        'structures',
      );
      expect(hit).not.toBeNull();
    });
  });
});
