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
    useGardenStore.setState((state) => ({
      garden: { ...state.garden, structures, zones, plantings },
    }));
    useUiStore.getState().clearSelection();
  },
};
