import type { ActionDescriptor } from '../types';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { expandToGroups } from '../../utils/groups';
import { pushHistory } from '../../store/history';

export const deleteAction: ActionDescriptor = {
  id: 'editing.delete',
  label: 'Delete',
  shortcut: [{ key: 'Delete' }, { key: 'Backspace' }],
  scope: 'canvas',
  targets: ['selection', 'objects'],
  canExecute: () => useUiStore.getState().selectedIds.length > 0,
  execute: () => {
    const sel = useUiStore.getState().selectedIds;
    if (sel.length === 0) return;
    const garden = useGardenStore.getState().garden;
    // Auto-expand to group siblings: drag and marquee already auto-expand,
    // so destructive ops do too (keeps the "group is one logical unit"
    // invariant — partial deletion of a group leaves a fragmented group).
    const ids = new Set(expandToGroups(sel, garden.structures));
    // Single undo checkpoint covers all removals.
    pushHistory(garden, sel);
    const structures = garden.structures.filter((s) => !ids.has(s.id));
    const zones = garden.zones.filter((z) => !ids.has(z.id));
    // Plantings: drop those explicitly selected AND any whose parent was deleted.
    const removedParents = new Set<string>();
    for (const s of garden.structures) if (ids.has(s.id)) removedParents.add(s.id);
    for (const z of garden.zones) if (ids.has(z.id)) removedParents.add(z.id);
    const plantings = garden.plantings.filter((p) => !ids.has(p.id) && !removedParents.has(p.parentId));
    // Seedlings (seed-starting mode): remove selected seedlings and clear their tray cells.
    const ss = garden.seedStarting;
    const remainingSeedlings = ss.seedlings.filter((s) => !ids.has(s.id));
    const removedSeedlingIds = new Set(ss.seedlings.filter((s) => ids.has(s.id)).map((s) => s.id));
    const trays = removedSeedlingIds.size === 0 ? ss.trays : ss.trays.map((tray) => {
      const slots = tray.slots.map((slot) =>
        slot.seedlingId && removedSeedlingIds.has(slot.seedlingId)
          ? { ...slot, state: 'empty' as const, seedlingId: null }
          : slot,
      );
      return { ...tray, slots };
    });
    useGardenStore.setState((state) => ({
      garden: {
        ...state.garden,
        structures,
        zones,
        plantings,
        seedStarting: { ...state.garden.seedStarting, seedlings: remainingSeedlings, trays },
      },
    }));
    useUiStore.getState().clearSelection();
  },
};
