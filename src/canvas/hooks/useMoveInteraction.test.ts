import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { useMoveInteraction } from './useMoveInteraction';

function createContainerRef(rect = { left: 0, top: 0, width: 800, height: 600 }) {
  const el = {
    getBoundingClientRect: () => rect,
  } as HTMLDivElement;
  return { current: el };
}

function mouseEvent(clientX: number, clientY: number, altKey = false): React.MouseEvent {
  return { clientX, clientY, altKey } as React.MouseEvent;
}

describe('useMoveInteraction', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
    // After reset: zoom=1 (px/ft), pan=(0,0) → screen coords = world coords
  });

  it('moves a structure', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 4, height: 4 });
    const patio = useGardenStore.getState().garden.structures[0];

    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

    result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
    result.current.move(mouseEvent(12, 11));

    const updated = useGardenStore.getState().garden.structures[0];
    expect(updated.x).toBe(11);
    expect(updated.y).toBe(10);
  });

  it('moves child structures along with parent', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 10, height: 10 });
    const patio = useGardenStore.getState().garden.structures[0];

    useGardenStore.getState().addStructure({ type: 'pot', x: 6, y: 6, width: 1, height: 1 });
    const pot = useGardenStore.getState().garden.structures[1];
    useGardenStore.getState().updateStructure(pot.id, { parentId: patio.id });

    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

    // Start dragging the patio from world (6,6), move mouse by (5,5)
    result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
    result.current.move(mouseEvent(11, 11));

    const structures = useGardenStore.getState().garden.structures;
    const updatedPatio = structures.find((s) => s.id === patio.id)!;
    const updatedPot = structures.find((s) => s.id === pot.id)!;

    // Patio moved by (5,5)
    expect(updatedPatio.x).toBe(10);
    expect(updatedPatio.y).toBe(10);
    // Pot moved by same delta
    expect(updatedPot.x).toBe(11);
    expect(updatedPot.y).toBe(11);
  });

  it('moves multiple children along with parent', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 2, y: 2, width: 20, height: 20 });
    const patio = useGardenStore.getState().garden.structures[0];

    useGardenStore.getState().addStructure({ type: 'pot', x: 3, y: 3, width: 1, height: 1 });
    useGardenStore.getState().addStructure({ type: 'pot', x: 5, y: 4, width: 1, height: 1 });
    const pot1 = useGardenStore.getState().garden.structures[1];
    const pot2 = useGardenStore.getState().garden.structures[2];
    useGardenStore.getState().updateStructure(pot1.id, { parentId: patio.id });
    useGardenStore.getState().updateStructure(pot2.id, { parentId: patio.id });

    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

    result.current.start(4, 4, patio.id, 'structures', patio.x, patio.y);
    result.current.move(mouseEvent(10, 10));

    const structures = useGardenStore.getState().garden.structures;
    const updatedPot1 = structures.find((s) => s.id === pot1.id)!;
    const updatedPot2 = structures.find((s) => s.id === pot2.id)!;

    // Both pots moved by (6,6)
    expect(updatedPot1.x).toBe(9);
    expect(updatedPot1.y).toBe(9);
    expect(updatedPot2.x).toBe(11);
    expect(updatedPot2.y).toBe(10);
  });

  it('does not move unrelated structures', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 2, y: 2, width: 5, height: 5 });
    const patio = useGardenStore.getState().garden.structures[0];

    useGardenStore.getState().addStructure({ type: 'pot', x: 10, y: 10, width: 1, height: 1 });
    const unrelated = useGardenStore.getState().garden.structures[1];

    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

    result.current.start(3, 3, patio.id, 'structures', patio.x, patio.y);
    result.current.move(mouseEvent(9, 9));

    const updatedUnrelated = useGardenStore.getState().garden.structures.find(
      (s) => s.id === unrelated.id,
    )!;
    expect(updatedUnrelated.x).toBe(10);
    expect(updatedUnrelated.y).toBe(10);
  });

  it('child positions are stable across multiple move events', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 20, height: 20 });
    const patio = useGardenStore.getState().garden.structures[0];

    useGardenStore.getState().addStructure({ type: 'pot', x: 2, y: 2, width: 1, height: 1 });
    const pot = useGardenStore.getState().garden.structures[1];
    useGardenStore.getState().updateStructure(pot.id, { parentId: patio.id });

    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

    result.current.start(1, 1, patio.id, 'structures', patio.x, patio.y);
    // First move exceeds threshold, subsequent moves are incremental
    result.current.move(mouseEvent(6, 6));
    result.current.move(mouseEvent(8, 8));
    result.current.move(mouseEvent(10, 10));

    const structures = useGardenStore.getState().garden.structures;
    const updatedPatio = structures.find((s) => s.id === patio.id)!;
    const updatedPot = structures.find((s) => s.id === pot.id)!;

    // Total delta is (9,9)
    expect(updatedPatio.x).toBe(9);
    expect(updatedPatio.y).toBe(9);
    expect(updatedPot.x).toBe(11);
    expect(updatedPot.y).toBe(11);
  });

  it('clears child tracking on end', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 0, y: 0, width: 20, height: 20 });
    const patio = useGardenStore.getState().garden.structures[0];

    useGardenStore.getState().addStructure({ type: 'pot', x: 2, y: 2, width: 1, height: 1 });
    const pot = useGardenStore.getState().garden.structures[1];
    useGardenStore.getState().updateStructure(pot.id, { parentId: patio.id });

    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

    // First drag: move patio by (5,5)
    result.current.start(1, 1, patio.id, 'structures', patio.x, patio.y);
    result.current.move(mouseEvent(6, 6));
    result.current.end();

    // Patio is now at (5,5), pot at (7,7)
    const movedPot = useGardenStore.getState().garden.structures.find((s) => s.id === pot.id)!;
    expect(movedPot.x).toBe(7);
    expect(movedPot.y).toBe(7);

    // Now move only the pot independently
    result.current.start(movedPot.x, movedPot.y, pot.id, 'structures', movedPot.x, movedPot.y);
    result.current.move(mouseEvent(movedPot.x + 6, movedPot.y + 6));
    result.current.end();

    const finalPatio = useGardenStore.getState().garden.structures.find((s) => s.id === patio.id)!;
    // Patio should not have moved during the pot drag
    expect(finalPatio.x).toBe(5);
    expect(finalPatio.y).toBe(5);
  });

  it('does not start drag below threshold', () => {
    useGardenStore.getState().addStructure({ type: 'patio', x: 5, y: 5, width: 4, height: 4 });
    const patio = useGardenStore.getState().garden.structures[0];

    const ref = createContainerRef();
    const { result } = renderHook(() => useMoveInteraction(ref));

    result.current.start(6, 6, patio.id, 'structures', patio.x, patio.y);
    // Move less than DRAG_THRESHOLD_PX
    result.current.move(mouseEvent(7, 7));
    result.current.end();

    const updated = useGardenStore.getState().garden.structures[0];
    // Should not have moved — click, not drag
    expect(updated.x).toBe(5);
    expect(updated.y).toBe(5);
  });
});
