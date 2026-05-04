import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { rotateCwAction } from './rotate';
import type { ActionContext } from '../types';

const ctx: ActionContext = { clipboard: { copy: () => {}, cut: () => {}, paste: () => {}, isEmpty: () => true }, target: { kind: 'selection' } };

describe('rotate actions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rotates a selected structure (swaps width/height after animation)', async () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 2 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    rotateCwAction.execute(ctx);

    // Advance past animation duration
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(20);
    }

    const s = useGardenStore.getState().garden.structures[0];
    expect(s.width).toBe(2);
    expect(s.height).toBe(4);
  });

  it('does not rotate circles', () => {
    useGardenStore.getState().addStructure({ type: 'pot', x: 0, y: 0, width: 2, height: 2 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    rotateCwAction.execute(ctx);

    const s = useGardenStore.getState().garden.structures[0];
    expect(s.width).toBe(2);
    expect(s.height).toBe(2);
  });
});
