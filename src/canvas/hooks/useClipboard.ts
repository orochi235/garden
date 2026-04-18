import { useRef } from 'react';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import type { Structure, Zone, Planting } from '../../model/types';

interface ClipboardContents {
  structures: Structure[];
  zones: Zone[];
  plantings: Planting[];
}

const empty: ClipboardContents = { structures: [], zones: [], plantings: [] };

export function useClipboard() {
  const clipboard = useRef<ClipboardContents>({ ...empty });

  function copy() {
    const ids = useUiStore.getState().selectedIds;
    if (ids.length === 0) return;
    const { garden } = useGardenStore.getState();
    clipboard.current = {
      structures: garden.structures.filter((s) => ids.includes(s.id)),
      zones: garden.zones.filter((z) => ids.includes(z.id)),
      plantings: garden.plantings.filter((p) => ids.includes(p.id)),
    };
  }

  function paste() {
    const cb = clipboard.current;
    if (cb.structures.length === 0 && cb.zones.length === 0 && cb.plantings.length === 0) return;

    const { garden } = useGardenStore.getState();
    const cellSize = garden.gridCellSizeFt;
    const offset = cellSize;

    for (const s of cb.structures) {
      useGardenStore.getState().addStructure({ type: s.type, x: s.x + offset, y: s.y + offset, width: s.width, height: s.height });
    }
    for (const z of cb.zones) {
      useGardenStore.getState().addZone({ x: z.x + offset, y: z.y + offset, width: z.width, height: z.height });
    }

    // Select the pasted objects (they're the last N added)
    const { garden: updated } = useGardenStore.getState();
    const pastedIds: string[] = [];
    if (cb.structures.length > 0) {
      pastedIds.push(...updated.structures.slice(-cb.structures.length).map((s) => s.id));
    }
    if (cb.zones.length > 0) {
      pastedIds.push(...updated.zones.slice(-cb.zones.length).map((z) => z.id));
    }
    if (pastedIds.length > 0) {
      useUiStore.getState().select(pastedIds[0]);
      for (let i = 1; i < pastedIds.length; i++) {
        useUiStore.getState().addToSelection(pastedIds[i]);
      }
    }

    // Update clipboard to point to the pasted copies so repeated paste cascades
    clipboard.current = {
      structures: updated.structures.slice(-cb.structures.length),
      zones: updated.zones.slice(-cb.zones.length),
      plantings: [],
    };
  }

  function isEmpty() {
    const cb = clipboard.current;
    return cb.structures.length === 0 && cb.zones.length === 0 && cb.plantings.length === 0;
  }

  return { copy, paste, isEmpty };
}
