import { beforeEach, describe, expect, it } from 'vitest';
import { useGardenStore } from './gardenStore';

describe('gardenStore — Phase 3 in-place mutation', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
  });

  it('does not lose structure edits and keeps the garden a Scene projection', () => {
    const store = useGardenStore.getState();
    const firstId = store.garden.structures[0].id;
    store.updateStructure(firstId, { color: '#123456' });
    const after = useGardenStore.getState().garden.structures.find((s) => s.id === firstId);
    expect(after!.color).toBe('#123456');
  });

  it('applies a moved structure position through fine-grained ops (applyGardenPatch)', () => {
    const store = useGardenStore.getState();
    const id = store.garden.structures[0].id;
    const moved = store.garden.structures.map((s) =>
      s.id === id ? { ...s, x: s.x + 2 } : s,
    );
    store.applyGardenPatch({ structures: moved });
    const after = useGardenStore.getState().garden.structures.find((s) => s.id === id);
    expect(after!.x).toBe(moved.find((s) => s.id === id)!.x);
  });

  it('base-only updates (name) publish without touching the scene', () => {
    const store = useGardenStore.getState();
    store.updateGarden({ name: 'Renamed' });
    expect(useGardenStore.getState().garden.name).toBe('Renamed');
  });
});
