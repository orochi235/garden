import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { rotateCwAction, rotateCcwAction } from './rotate';
import { duplicateAction } from './duplicate';
import type { ActionContext } from '../types';

const ctx: ActionContext = { clipboard: { copy: () => {}, paste: () => {}, isEmpty: () => true }, target: { kind: 'selection' } };

describe('rotate actions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGardenStore.getState().reset();
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

describe('duplicate action', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
  });

  it('duplicates selected structure with offset', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    duplicateAction.execute(ctx);

    const structures = useGardenStore.getState().garden.structures;
    expect(structures).toHaveLength(2);
    expect(structures[1].x).toBeGreaterThan(0);
  });
});
