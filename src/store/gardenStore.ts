import { create } from 'zustand';
import { computeSlots } from '../model/arrangement';
import type { Arrangement, ParentBounds } from '../model/arrangement';
import { getCultivar } from '../model/cultivars';
import type { Blueprint, Garden, LayerId, Planting, Structure, Zone } from '../model/types';
import { createGarden, createPlanting, createStructure, createZone } from '../model/types';
import { structuresCollide } from '../utils/collision';
import { canRedo, canUndo, clearHistory, pushHistory, redo, undo } from './history';
import { useUiStore } from './uiStore';

interface GardenStore {
  garden: Garden;
  updateGarden: (
    updates: Partial<
      Pick<
        Garden,
        'name' | 'widthFt' | 'heightFt' | 'gridCellSizeFt' | 'displayUnit' | 'groundColor'
      >
    >,
  ) => void;
  loadGarden: (garden: Garden) => void;
  reset: () => void;
  setBlueprint: (blueprint: Blueprint | null) => void;
  addStructure: (opts: {
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  updateStructure: (id: string, updates: Partial<Omit<Structure, 'id' | 'type'>>) => void;
  commitStructureUpdate: (id: string, updates: Partial<Omit<Structure, 'id' | 'type'>>) => void;
  removeStructure: (id: string) => void;
  addZone: (opts: { x: number; y: number; width: number; height: number; color?: string; pattern?: string | null }) => void;
  updateZone: (id: string, updates: Partial<Omit<Zone, 'id'>>) => void;
  commitZoneUpdate: (id: string, updates: Partial<Omit<Zone, 'id'>>) => void;
  removeZone: (id: string) => void;
  addPlanting: (opts: { parentId: string; x: number; y: number; cultivarId: string }) => void;
  updatePlanting: (id: string, updates: Partial<Omit<Planting, 'id'>>) => void;
  commitPlantingUpdate: (id: string, updates: Partial<Omit<Planting, 'id'>>) => void;
  removePlanting: (id: string) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function defaultGarden(): Garden {
  return createGarden({ name: 'My Garden', widthFt: 20, heightFt: 20 });
}

function isLocked(layer: LayerId): boolean {
  return useUiStore.getState().layerLocked[layer];
}

export const useGardenStore = create<GardenStore>((set, get) => {
  /** Apply a partial update to the garden object. */
  function patch(updates: Partial<Garden>) {
    set((state) => ({ garden: { ...state.garden, ...updates } }));
  }

  /** Push current state to undo stack, then patch. */
  function commitPatch(updates: Partial<Garden>) {
    pushHistory(get().garden);
    patch(updates);
  }

  /** Map over a collection, replacing the item with matching id. */
  function mapCollection<T extends { id: string }>(
    items: T[],
    id: string,
    updates: Partial<Omit<T, 'id'>>,
  ): T[] {
    return items.map((item) => (item.id === id ? { ...item, ...updates } : item));
  }

  /** Rearrange all plantings in a parent using cultivar spacing to determine positions. */
  function rearrangePlantings(
    plantings: Planting[],
    parentId: string,
    parent: { x: number; y: number; width: number; height: number; shape?: string; arrangement: Arrangement | null },
  ): Planting[] {
    const arrangement = parent.arrangement;
    if (!arrangement || arrangement.type === 'free') return plantings;

    const bounds: ParentBounds = {
      x: parent.x,
      y: parent.y,
      width: parent.width,
      height: parent.height,
      shape: (parent.shape === 'circle' ? 'circle' : 'rectangle') as 'rectangle' | 'circle',
    };

    const children = plantings.filter((p) => p.parentId === parentId);
    const others = plantings.filter((p) => p.parentId !== parentId);

    if (arrangement.type === 'single') {
      // Single: center the first planting
      const slots = computeSlots(arrangement, bounds);
      const rearranged = children.map((p, i) =>
        i < slots.length ? { ...p, x: slots[i].x - parent.x, y: slots[i].y - parent.y } : p,
      );
      return [...others, ...rearranged];
    }

    if (arrangement.type === 'ring') {
      // Ring: distribute evenly around the ring
      const slots = computeSlots(arrangement, bounds);
      const rearranged = children.map((p, i) =>
        i < slots.length ? { ...p, x: slots[i].x - parent.x, y: slots[i].y - parent.y } : p,
      );
      return [...others, ...rearranged];
    }

    // Grid/Rows: pack using each plant's cultivar spacing
    const margin = 'marginFt' in arrangement ? arrangement.marginFt : 0.25;
    const vertical = arrangement.type === 'rows' && arrangement.direction === 90;

    const rearranged: Planting[] = [];
    const positions: { x: number; y: number }[] = [];

    // Pack row by row (or column by column)
    let primaryPos = margin;
    let rowMaxSpacing = 0;
    let secondaryPositions: { pos: number; spacing: number }[] = [];
    let rowPlantings: Planting[] = [];

    for (const p of children) {
      const cultivar = getCultivar(p.cultivarId);
      const spacing = cultivar?.spacingFt ?? 0.5;

      const secondaryPos = secondaryPositions.length === 0
        ? margin + spacing / 2
        : secondaryPositions[secondaryPositions.length - 1].pos + secondaryPositions[secondaryPositions.length - 1].spacing / 2 + spacing / 2;

      const secondaryLimit = vertical ? parent.height : parent.width;
      const primaryLimit = vertical ? parent.width : parent.height;

      // Check if this plant fits in the current row
      if (secondaryPos + spacing / 2 > secondaryLimit - margin && secondaryPositions.length > 0) {
        // Flush current row
        for (let i = 0; i < rowPlantings.length; i++) {
          const sp = secondaryPositions[i];
          const px = vertical ? primaryPos + rowMaxSpacing / 2 : sp.pos;
          const py = vertical ? sp.pos : primaryPos + rowMaxSpacing / 2;
          positions.push({ x: px, y: py });
          rearranged.push({ ...rowPlantings[i], x: px, y: py });
        }
        primaryPos += rowMaxSpacing;
        secondaryPositions = [];
        rowPlantings = [];
        rowMaxSpacing = 0;

        // Start new row with this plant
        const newSecondaryPos = margin + spacing / 2;
        if (primaryPos + spacing > primaryLimit - margin) {
          // No more room — leave remaining plants in place
          rearranged.push(p);
          continue;
        }
        secondaryPositions.push({ pos: newSecondaryPos, spacing });
        rowPlantings.push(p);
        rowMaxSpacing = Math.max(rowMaxSpacing, spacing);
      } else {
        secondaryPositions.push({ pos: secondaryPos, spacing });
        rowPlantings.push(p);
        rowMaxSpacing = Math.max(rowMaxSpacing, spacing);
      }
    }

    // Flush final row
    for (let i = 0; i < rowPlantings.length; i++) {
      const sp = secondaryPositions[i];
      const px = vertical ? primaryPos + rowMaxSpacing / 2 : sp.pos;
      const py = vertical ? sp.pos : primaryPos + rowMaxSpacing / 2;
      rearranged.push({ ...rowPlantings[i], x: px, y: py });
    }

    return [...others, ...rearranged];
  }

  return {
    garden: defaultGarden(),

    loadGarden: (garden) => {
      clearHistory();
      set({ garden });
    },

    reset: () => {
      clearHistory();
      set({ garden: defaultGarden() });
    },

    updateGarden: (updates) => {
      commitPatch(updates);
    },

    setBlueprint: (blueprint) => {
      commitPatch({ blueprint });
    },

    // --- Structures ---

    addStructure: (opts) => {
      if (isLocked('structures')) return;
      const { structures } = get().garden;
      const newStructure = createStructure(opts);
      if (structuresCollide(newStructure, structures)) return;
      commitPatch({ structures: [...structures, newStructure] });
    },

    updateStructure: (id, updates) => {
      if (isLocked('structures')) return;
      patch({ structures: mapCollection(get().garden.structures, id, updates) });
    },

    commitStructureUpdate: (id, updates) => {
      if (isLocked('structures')) return;
      const newStructures = mapCollection(get().garden.structures, id, updates);
      if ('arrangement' in updates) {
        const parent = newStructures.find((s) => s.id === id);
        if (parent) {
          const newPlantings = rearrangePlantings(get().garden.plantings, id, parent);
          commitPatch({ structures: newStructures, plantings: newPlantings });
          return;
        }
      }
      commitPatch({ structures: newStructures });
    },

    removeStructure: (id) => {
      if (isLocked('structures')) return;
      const { structures, plantings } = get().garden;
      commitPatch({
        structures: structures.filter((s) => s.id !== id),
        plantings: plantings.filter((p) => p.parentId !== id),
      });
    },

    // --- Zones ---

    addZone: (opts) => {
      if (isLocked('zones')) return;
      const { zones } = get().garden;
      commitPatch({ zones: [...zones, createZone(opts)] });
    },

    updateZone: (id, updates) => {
      if (isLocked('zones')) return;
      patch({ zones: mapCollection(get().garden.zones, id, updates) });
    },

    commitZoneUpdate: (id, updates) => {
      if (isLocked('zones')) return;
      const newZones = mapCollection(get().garden.zones, id, updates);
      if ('arrangement' in updates) {
        const parent = newZones.find((z) => z.id === id);
        if (parent) {
          const newPlantings = rearrangePlantings(get().garden.plantings, id, parent);
          commitPatch({ zones: newZones, plantings: newPlantings });
          return;
        }
      }
      commitPatch({ zones: newZones });
    },

    removeZone: (id) => {
      if (isLocked('zones')) return;
      const { zones, plantings } = get().garden;
      commitPatch({
        zones: zones.filter((z) => z.id !== id),
        plantings: plantings.filter((p) => p.parentId !== id),
      });
    },

    // --- Plantings ---

    addPlanting: (opts) => {
      if (isLocked('plantings')) return;
      const { plantings, structures, zones } = get().garden;
      const newPlantings = [...plantings, createPlanting(opts)];
      const parent = structures.find((s) => s.id === opts.parentId)
        ?? zones.find((z) => z.id === opts.parentId);
      if (parent) {
        commitPatch({ plantings: rearrangePlantings(newPlantings, opts.parentId, parent) });
      } else {
        commitPatch({ plantings: newPlantings });
      }
    },

    updatePlanting: (id, updates) => {
      if (isLocked('plantings')) return;
      patch({ plantings: mapCollection(get().garden.plantings, id, updates) });
    },

    commitPlantingUpdate: (id, updates) => {
      if (isLocked('plantings')) return;
      commitPatch({ plantings: mapCollection(get().garden.plantings, id, updates) });
    },

    removePlanting: (id) => {
      if (isLocked('plantings')) return;
      commitPatch({ plantings: get().garden.plantings.filter((p) => p.id !== id) });
    },

    // --- History ---

    checkpoint: () => {
      pushHistory(get().garden);
    },

    undo: () => {
      const prev = undo(get().garden);
      if (prev) set({ garden: prev });
    },

    redo: () => {
      const next = redo(get().garden);
      if (next) set({ garden: next });
    },

    canUndo,
    canRedo,
  };
});
