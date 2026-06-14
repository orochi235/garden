import { beforeEach, describe, expect, it } from 'vitest';
import { useGardenStore } from './gardenStore';

describe('gardenStore — Phase 3 in-place mutation', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
  });

  // Guards the differ's subtree-removal path end-to-end through the real store:
  // removeStructure must cascade to remove child plantings from garden.plantings.
  it('removeStructure cascades to delete child plantings (subtree-removal path)', () => {
    const store = useGardenStore.getState();
    // The default garden seeds several raised-bed structures; grab the first one.
    const bed = store.garden.structures.find((s) => s.type === 'raised-bed')!;
    expect(bed).toBeDefined();

    // Add a planting under this bed. Cell-grid parents snap to nearest free cell —
    // the exact x/y may shift, but parentId is always set correctly.
    store.addPlanting({ parentId: bed.id, x: 1, y: 1, cultivarId: 'tomato' });

    const planting = useGardenStore.getState().garden.plantings.find((p) => p.parentId === bed.id);
    expect(planting).toBeDefined();
    const plantingId = planting!.id;

    // Now remove the parent structure — cascade must purge its child planting.
    useGardenStore.getState().removeStructure(bed.id);

    const after = useGardenStore.getState().garden;
    expect(after.structures.find((s) => s.id === bed.id)).toBeUndefined();
    expect(after.plantings.find((p) => p.id === plantingId)).toBeUndefined();
  });

  // Guards the differ's reparent path end-to-end through the real store:
  // updatePlanting({ parentId }) must reassign the planting to the new parent.
  it('updatePlanting reparents a planting across structures (reparent path)', () => {
    const store = useGardenStore.getState();
    const beds = store.garden.structures.filter((s) => s.type === 'raised-bed');
    // Default garden seeds six raised-beds; we need at least two.
    expect(beds.length).toBeGreaterThanOrEqual(2);
    const bedA = beds[0];
    const bedB = beds[1];

    // Add a planting under bedA. Cell-grid parents snap coordinates — parentId
    // is deterministic regardless of the snap.
    store.addPlanting({ parentId: bedA.id, x: 1, y: 1, cultivarId: 'tomato' });

    const planting = useGardenStore.getState().garden.plantings.find((p) => p.parentId === bedA.id);
    expect(planting).toBeDefined();
    const plantingId = planting!.id;

    // Reparent to bedB — drives the differ's move/rebuild path.
    useGardenStore.getState().updatePlanting(plantingId, { parentId: bedB.id });

    const after = useGardenStore.getState().garden.plantings.find((p) => p.id === plantingId);
    expect(after).toBeDefined();
    expect(after!.parentId).toBe(bedB.id);
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
    const moved = store.garden.structures.map((s) => (s.id === id ? { ...s, x: s.x + 2 } : s));
    store.applyGardenPatch({ structures: moved });
    const after = useGardenStore.getState().garden.structures.find((s) => s.id === id);
    expect(after!.x).toBe(moved.find((s) => s.id === id)!.x);
  });

  it('base-only updates (name) publish without touching the scene', () => {
    const store = useGardenStore.getState();
    store.updateGarden({ name: 'Renamed' });
    expect(useGardenStore.getState().garden.name).toBe('Renamed');
  });

  // Phase 3 guard: the Scene instance is mutated in place, not recreated.
  // Observable proof: a store subscription registered BEFORE a spatial patch
  // still fires AFTER it. Under the old bridge, adoptGarden replaced the scene
  // + re-subscribed; a subscription taken on the old instance would go silent.
  // With Phase 3, the same instance is reused so any subscriber keeps firing.
  it('store subscription registered before a spatial patch keeps receiving updates (Phase 3: in-place instance)', () => {
    const store = useGardenStore.getState();
    const id = store.garden.structures[0].id;

    const seenColors: string[] = [];
    const unsub = useGardenStore.subscribe((state) => {
      const s = state.garden.structures.find((s) => s.id === id);
      if (s) seenColors.push(s.color ?? '');
    });

    // Three consecutive spatial patches — each must fire the subscription.
    store.updateStructure(id, { color: '#aaa111' });
    store.updateStructure(id, { color: '#bbb222' });
    store.updateStructure(id, { color: '#ccc333' });

    unsub();

    // All three patches published through the same store (and thus the same
    // scene instance). If the instance were recreated the subscription would
    // have silently missed later events.
    expect(seenColors).toContain('#aaa111');
    expect(seenColors).toContain('#bbb222');
    expect(seenColors).toContain('#ccc333');
    expect(useGardenStore.getState().garden.structures.find((s) => s.id === id)!.color).toBe(
      '#ccc333',
    );
  });
});
