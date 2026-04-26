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
