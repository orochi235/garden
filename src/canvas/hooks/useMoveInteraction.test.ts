import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { useMoveInteraction } from './useMoveInteraction';

function createContainerRef(rect = { left: 0, top: 0, width: 800, height: 600 }) {
  const el = { getBoundingClientRect: () => rect } as HTMLDivElement;
  return { current: el };
}

function mouseEvent(clientX: number, clientY: number, altKey = false): React.MouseEvent {
  return { clientX, clientY, altKey } as React.MouseEvent;
}

describe('useMoveInteraction', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });

  it('does not mutate garden during move — updates overlay instead', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 4, height: 4 });
    const patio = useGardenStore.getState().garden.structures[0];
    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

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
    const { result } = renderHook(() => useMoveInteraction(ref));

    result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
    result.current.move(mouseEvent(12, 11));
    result.current.end();

    const updated = useGardenStore.getState().garden.structures[0];
    expect(updated.x).toBe(11);
    expect(updated.y).toBe(10);
    expect(useUiStore.getState().dragOverlay).toBeNull();
  });

  it('moves child structures in overlay along with parent', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 10, height: 10 });
    const patio = useGardenStore.getState().garden.structures[0];
    useGardenStore.getState().addStructure({ type: 'pot', x: 6, y: 6, width: 1, height: 1 });
    const pot = useGardenStore.getState().garden.structures[1];
    useGardenStore.getState().updateStructure(pot.id, { parentId: patio.id });

    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

    result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
    result.current.move(mouseEvent(11, 11));

    const overlay = useUiStore.getState().dragOverlay!;
    expect(overlay.objects).toHaveLength(2);
    expect(overlay.hideIds).toContain(patio.id);
    expect(overlay.hideIds).toContain(pot.id);

    result.current.end();
    const structures = useGardenStore.getState().garden.structures;
    expect(structures.find(s => s.id === patio.id)!.x).toBe(10);
    expect(structures.find(s => s.id === pot.id)!.x).toBe(11);
  });

  it('does not start drag below threshold', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 4, height: 4 });
    const patio = useGardenStore.getState().garden.structures[0];
    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

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
    const { result } = renderHook(() => useMoveInteraction(ref));

    result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
    result.current.move(mouseEvent(12, 11));
    result.current.cancel();

    expect(useUiStore.getState().dragOverlay).toBeNull();
    expect(useGardenStore.getState().garden.structures[0].x).toBe(5);
  });

  describe('planting free-agent drag', () => {
    function setupPlantingInZone() {
      // Use zoom=10 so 1ft = 10 screen-px, easily clearing the 4-px drag threshold
      // with sub-foot world movements. Lets us land within the 1ft snap-back radius.
      useUiStore.getState().setZoom(10);
      useGardenStore.getState().addZone({ x: 5, y: 5, width: 4, height: 4 });
      const zone = useGardenStore.getState().garden.zones[0];
      useGardenStore.getState().addPlanting({ parentId: zone.id, x: 2, y: 2, cultivarId: 'tomato' });
      const planting = useGardenStore.getState().garden.plantings[0];
      // World position is parent.x + planting.x. addPlanting may snap to a grid
      // slot, so read the actual coords back rather than assuming (7,7).
      const worldX = zone.x + planting.x;
      const worldY = zone.y + planting.y;
      return { zone, planting, worldX, worldY };
    }

    it('snaps back when released within one cell of the original position', () => {
      const { zone, planting, worldX, worldY } = setupPlantingInZone();
      const ref = createContainerRef();
      const { result } = renderHook(() => useMoveInteraction(ref));

      // Start drag at the planting's world position.
      result.current.start(worldX, worldY, planting.id, 'plantings', worldX, worldY);
      // Move 1ft (10 px at zoom=10) — clears 4-px threshold and stays within the
      // 1ft snap-back radius. altKey=true bypasses grid snap.
      const screenX = worldX * 10;
      const screenY = worldY * 10;
      result.current.move(mouseEvent(screenX + 10, screenY, true));
      result.current.end();

      // Snap back: planting unchanged, still parented to original zone.
      const after = useGardenStore.getState().garden.plantings;
      expect(after).toHaveLength(1);
      expect(after[0].id).toBe(planting.id);
      expect(after[0].parentId).toBe(zone.id);
      expect(after[0].x).toBe(planting.x);
      expect(after[0].y).toBe(planting.y);
      expect(useUiStore.getState().dragOverlay).toBeNull();
    });

    it('snap-back does not create an undo entry', () => {
      const { planting, worldX, worldY } = setupPlantingInZone();
      const ref = createContainerRef();
      const { result } = renderHook(() => useMoveInteraction(ref));

      result.current.start(worldX, worldY, planting.id, 'plantings', worldX, worldY);
      result.current.move(mouseEvent(worldX * 10 + 10, worldY * 10, true));
      result.current.end();

      // No undo entry was pushed — undoing reverts the planting/zone setup,
      // not a no-op snap-back.
      expect(useGardenStore.getState().canUndo()).toBe(true);
      useGardenStore.getState().undo();
      // After one undo: planting was removed (rolling back its addPlanting).
      expect(useGardenStore.getState().garden.plantings).toHaveLength(0);
    });

    it('removes the planting when dropped over empty space', () => {
      const { planting, worldX, worldY } = setupPlantingInZone();
      const ref = createContainerRef();
      const { result } = renderHook(() => useMoveInteraction(ref));

      result.current.start(worldX, worldY, planting.id, 'plantings', worldX, worldY);
      // Drag far outside the zone: world (20, 20) at zoom=10 → screen (200, 200).
      result.current.move(mouseEvent(200, 200, true));
      result.current.end();

      expect(useGardenStore.getState().garden.plantings).toHaveLength(0);
      expect(useUiStore.getState().dragOverlay).toBeNull();
    });

    it('remove on free drop is undoable', () => {
      const { planting, worldX, worldY } = setupPlantingInZone();
      const ref = createContainerRef();
      const { result } = renderHook(() => useMoveInteraction(ref));

      result.current.start(worldX, worldY, planting.id, 'plantings', worldX, worldY);
      result.current.move(mouseEvent(200, 200, true));
      result.current.end();

      expect(useGardenStore.getState().garden.plantings).toHaveLength(0);
      useGardenStore.getState().undo();
      const restored = useGardenStore.getState().garden.plantings;
      expect(restored).toHaveLength(1);
      expect(restored[0].id).toBe(planting.id);
    });
  });

  it('creates exactly one undo entry on commit', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 4, height: 4 });
    const patio = useGardenStore.getState().garden.structures[0];
    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

    result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
    result.current.move(mouseEvent(12, 11));
    result.current.end();

    expect(useGardenStore.getState().garden.structures[0].x).toBe(11);
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures[0].x).toBe(5);
  });
});
