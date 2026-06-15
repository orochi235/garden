import type { NodeId, SelectionApi } from '@orochi235/weasel';
import { useMemo } from 'react';
import { useUiStore } from '../store/uiStore';

/**
 * Bridge eric's Zustand-owned selection (`uiStore.selectedIds`) into the kit's
 * `SelectionApi` shape so `<SceneCanvas selection={…}>` shares one selection
 * source of truth.
 *
 * Phase 6 (big-bang minus move): eric's vendored select tool remains the
 * authoritative selection DRIVER — canvas clicks still flow through it, not
 * `applyClick`. This bridge only mirrors `uiStore` into the shape SceneCanvas
 * expects (and that the kit selection-overlay chrome will read once it's
 * adopted), keeping the kit's internal selection from diverging.
 */
export function useGardenSelectionApi(): SelectionApi {
  // Reactive read: re-renders this hook's component when the selection changes,
  // and gives `current` a reference that's stable until the selection changes.
  const selectedIds = useUiStore((s) => s.selectedIds);

  // Imperative methods read/write through getState() so they're stable for the
  // store lifetime and never close over a stale selection.
  const methods = useMemo(() => {
    const read = (): NodeId[] => useUiStore.getState().selectedIds as NodeId[];
    const write = (ids: NodeId[]) => useUiStore.getState().setSelection(ids as string[]);
    return {
      get: read,
      set: write,
      add: (id: NodeId) => useUiStore.getState().addToSelection(id as string),
      remove: (id: NodeId) => write(read().filter((x) => x !== id)),
      toggle: (id: NodeId) => {
        const ids = read();
        write(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
      },
      clear: () => useUiStore.getState().clearSelection(),
      contains: (id: NodeId) => read().includes(id),
      // Mirror eric's click policy: extend (shift/meta/ctrl) toggles; plain
      // click replaces. Unused in Phase 6 (the vendored select tool owns
      // clicks) but implemented for the future kit-chrome adoption.
      applyClick: (id: NodeId, modifiers: { shift: boolean; meta: boolean; ctrl: boolean }) => {
        if (modifiers.shift || modifiers.meta || modifiers.ctrl) {
          const ids = read();
          write(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
        } else {
          write([id]);
        }
      },
      adapterMethods: { getSelection: read, setSelection: write },
    };
  }, []);

  return useMemo<SelectionApi>(
    () => ({ current: selectedIds as unknown as readonly NodeId[], ...methods }),
    [selectedIds, methods],
  );
}
