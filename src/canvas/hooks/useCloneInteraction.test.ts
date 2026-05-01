import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { useCloneInteraction } from './useCloneInteraction';

function createContainerRef(rect = { left: 0, top: 0, width: 800, height: 600 }) {
  const el = { getBoundingClientRect: () => rect } as HTMLDivElement;
  return { current: el };
}

function mouseEvent(clientX: number, clientY: number, altKey = false): React.MouseEvent {
  return { clientX, clientY, altKey } as React.MouseEvent;
}

describe('useCloneInteraction', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });

  describe('structure clone from palette', () => {
    it('does not mutate garden during drag — updates overlay instead', () => {
      useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 4, height: 4 });
      const patio = useGardenStore.getState().garden.structures[0];
      const ref = createContainerRef();
      const { result } = renderHook(() => useCloneInteraction(ref));

      result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
      result.current.move(mouseEvent(12, 11));

      const gardenPatio = useGardenStore.getState().garden.structures[0];
      expect(gardenPatio.x).toBe(5);
      expect(gardenPatio.y).toBe(5);

      const overlay = useUiStore.getState().dragOverlay;
      expect(overlay).not.toBeNull();
      expect(overlay!.hideIds).toContain(patio.id);
      expect((overlay!.objects[0] as any).x).toBe(11);
    });

    it('commits overlay to garden on end', () => {
      useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 4, height: 4 });
      const patio = useGardenStore.getState().garden.structures[0];
      const ref = createContainerRef();
      const { result } = renderHook(() => useCloneInteraction(ref));

      result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
      result.current.move(mouseEvent(12, 11));
      result.current.end();

      const updated = useGardenStore.getState().garden.structures[0];
      expect(updated.x).toBe(11);
      expect(updated.y).toBe(10);
      expect(useUiStore.getState().dragOverlay).toBeNull();
    });

    it('does not start drag below threshold', () => {
      useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 4, height: 4 });
      const patio = useGardenStore.getState().garden.structures[0];
      const ref = createContainerRef();
      const { result } = renderHook(() => useCloneInteraction(ref));

      result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
      result.current.move(mouseEvent(7, 7));
      result.current.end();

      expect(useUiStore.getState().dragOverlay).toBeNull();
      expect(useGardenStore.getState().garden.structures[0].x).toBe(5);
    });

    it('cancel clears overlay without committing', () => {
      useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 4, height: 4 });
      const patio = useGardenStore.getState().garden.structures[0];
      const ref = createContainerRef();
      const { result } = renderHook(() => useCloneInteraction(ref));

      result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
      result.current.move(mouseEvent(12, 11));
      result.current.cancel();

      expect(useUiStore.getState().dragOverlay).toBeNull();
      expect(useGardenStore.getState().garden.structures[0].x).toBe(5);
    });

    it('creates exactly one undo entry on commit', () => {
      useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 4, height: 4 });
      const patio = useGardenStore.getState().garden.structures[0];
      const ref = createContainerRef();
      const { result } = renderHook(() => useCloneInteraction(ref));

      result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
      result.current.move(mouseEvent(12, 11));
      result.current.end();

      expect(useGardenStore.getState().garden.structures[0].x).toBe(11);
      useGardenStore.getState().undo();
      expect(useGardenStore.getState().garden.structures[0].x).toBe(5);
    });
  });

  describe('planting clone from palette', () => {
    function setupCloneSource() {
      useUiStore.getState().setZoom(10);
      useGardenStore.getState().addZone({ x: 5, y: 5, width: 4, height: 4 });
      const zone = useGardenStore.getState().garden.zones[0];
      useGardenStore.getState().addPlanting({ parentId: zone.id, x: 1, y: 1, cultivarId: 'tomato' });
      const planting = useGardenStore.getState().garden.plantings[0];
      const worldX = zone.x + planting.x;
      const worldY = zone.y + planting.y;
      return { zone, planting, worldX, worldY };
    }

    it('creates transient overlay with empty hideIds (original stays visible)', () => {
      const { zone, planting, worldX, worldY } = setupCloneSource();
      const ref = createContainerRef();
      const { result } = renderHook(() => useCloneInteraction(ref));

      result.current.start(worldX, worldY, planting.id, 'plantings', worldX, worldY, false, {
        parentId: planting.parentId,
        x: planting.x,
        y: planting.y,
        cultivarId: planting.cultivarId,
        parentWorldX: zone.x,
        parentWorldY: zone.y,
      });
      result.current.move(mouseEvent(worldX * 10 + 50, worldY * 10, true));

      const overlay = useUiStore.getState().dragOverlay;
      expect(overlay).not.toBeNull();
      expect(overlay!.hideIds).toHaveLength(0); // original stays visible
      expect(overlay!.layer).toBe('plantings');

      // Original planting still exists unchanged
      expect(useGardenStore.getState().garden.plantings).toHaveLength(1);
      expect(useGardenStore.getState().garden.plantings[0].id).toBe(planting.id);
    });

    it('adds a new planting when dropped inside a container', () => {
      const { zone, planting, worldX, worldY } = setupCloneSource();
      const ref = createContainerRef();
      const { result } = renderHook(() => useCloneInteraction(ref));

      result.current.start(worldX, worldY, planting.id, 'plantings', worldX, worldY, false, {
        parentId: planting.parentId,
        x: planting.x,
        y: planting.y,
        cultivarId: planting.cultivarId,
        parentWorldX: zone.x,
        parentWorldY: zone.y,
      });
      // Drop inside the zone (zone is at x:5,y:5 w:4 h:4 → center at 7,7 in world → 70,70 at zoom=10)
      result.current.move(mouseEvent(70, 70, true));
      result.current.end();

      // Original planting still present; new planting added
      const plantings = useGardenStore.getState().garden.plantings;
      expect(plantings).toHaveLength(2);
      expect(plantings.some(p => p.id === planting.id)).toBe(true);
      expect(plantings.some(p => p.id !== planting.id && p.cultivarId === 'tomato')).toBe(true);
    });

    it('cancel leaves garden unchanged', () => {
      const { zone, planting, worldX, worldY } = setupCloneSource();
      const ref = createContainerRef();
      const { result } = renderHook(() => useCloneInteraction(ref));

      result.current.start(worldX, worldY, planting.id, 'plantings', worldX, worldY, false, {
        parentId: planting.parentId,
        x: planting.x,
        y: planting.y,
        cultivarId: planting.cultivarId,
        parentWorldX: zone.x,
        parentWorldY: zone.y,
      });
      result.current.move(mouseEvent(70, 70, true));
      result.current.cancel();

      expect(useUiStore.getState().dragOverlay).toBeNull();
      expect(useGardenStore.getState().garden.plantings).toHaveLength(1);
    });
  });
});
