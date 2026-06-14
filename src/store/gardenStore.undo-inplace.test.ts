import { beforeEach, describe, expect, it } from 'vitest';
import { instantiatePreset } from '../model/trayCatalog';
import { useGardenStore } from './gardenStore';
import { useUiStore } from './uiStore';

describe('gardenStore — Phase 4 in-place undo/redo', () => {
  beforeEach(() => {
    useUiStore.getState().setAppMode('garden');
    useGardenStore.getState().reset();
    // reset() loads defaultGarden(), which already seeds structures (paths +
    // raised-beds), so structures[0] exists without any extra setup.
  });

  it('undo restores a structure position, redo re-applies it', () => {
    const id = useGardenStore.getState().garden.structures[0].id;
    const startX = useGardenStore.getState().garden.structures[0].x;
    useGardenStore.getState().commitStructureUpdate(id, { x: startX + 3 });
    expect(useGardenStore.getState().garden.structures.find((s) => s.id === id)!.x).toBe(
      startX + 3,
    );
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures.find((s) => s.id === id)!.x).toBe(startX);
    useGardenStore.getState().redo();
    expect(useGardenStore.getState().garden.structures.find((s) => s.id === id)!.x).toBe(
      startX + 3,
    );
  });

  it('undo reverts a base field (name) but NOT live nursery edits (overlay trick)', () => {
    useGardenStore.getState().updateGarden({ name: 'After' });
    const id = useGardenStore.getState().garden.structures[0].id;
    const x0 = useGardenStore.getState().garden.structures[0].x;
    useGardenStore.getState().commitStructureUpdate(id, { x: x0 + 1 });

    // Nursery edit AFTER the last garden snapshot (stays in nursery mode's own history).
    useUiStore.getState().setAppMode('nursery');
    useGardenStore.getState().addTray(instantiatePreset('1020-36')!);
    const traysAfter = useGardenStore.getState().garden.nursery.trays.length;

    // Switch back to garden mode and undo the spatial change.
    useUiStore.getState().setAppMode('garden');
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures.find((s) => s.id === id)!.x).toBe(x0);
    // Nursery tray must survive the garden undo (overlay trick).
    expect(useGardenStore.getState().garden.nursery.trays.length).toBe(traysAfter);
  });

  it('survives many consecutive undo/redo cycles', () => {
    const id = useGardenStore.getState().garden.structures[0].id;
    const x0 = useGardenStore.getState().garden.structures[0].x;
    for (let i = 1; i <= 5; i++) {
      useGardenStore.getState().commitStructureUpdate(id, { x: x0 + i });
    }
    for (let i = 0; i < 5; i++) useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures.find((s) => s.id === id)!.x).toBe(x0);
    for (let i = 0; i < 5; i++) useGardenStore.getState().redo();
    expect(useGardenStore.getState().garden.structures.find((s) => s.id === id)!.x).toBe(x0 + 5);
  });
});
