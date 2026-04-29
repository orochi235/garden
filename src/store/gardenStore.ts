import { create } from 'zustand';
import { computeSlots } from '../model/arrangement';
import type { Arrangement } from '../model/arrangement';
import { emptySeedStartingState } from '../model/seedStarting';
import type { Blueprint, Garden, LayerId, Planting, Structure, Zone } from '../model/types';
import { createGarden, createPlanting, createStructure, createZone, DEFAULT_WALL_THICKNESS_FT, generateId, getPlantableBounds } from '../model/types';
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
  const garden = createGarden({ name: 'My Garden', widthFt: 20, heightFt: 20 });
  const pathGroupId = generateId();
  garden.structures = [
    createStructure({ type: 'path', x: 5, y: 0, width: 3, height: 20, groupId: pathGroupId }),
    createStructure({ type: 'path', x: 12, y: 0, width: 3, height: 20, groupId: pathGroupId }),
    createStructure({ type: 'path', x: 0, y: 8.5, width: 20, height: 3, groupId: pathGroupId }),
    createStructure({ type: 'raised-bed', x: 1, y: 1, width: 4, height: 7.5 }),
    createStructure({ type: 'raised-bed', x: 8, y: 1, width: 4, height: 7.5 }),
    createStructure({ type: 'raised-bed', x: 15, y: 1, width: 4, height: 7.5 }),
    createStructure({ type: 'raised-bed', x: 1, y: 11.5, width: 4, height: 7.5 }),
    createStructure({ type: 'raised-bed', x: 8, y: 11.5, width: 4, height: 7.5 }),
    createStructure({ type: 'raised-bed', x: 15, y: 11.5, width: 4, height: 7.5 }),
  ];
  return garden;
}

/** Empty garden for tests. */
export function blankGarden(): Garden {
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

  /** Rearrange all plantings in a parent by snapping them to computed slots. */
  function rearrangePlantings(
    plantings: Planting[],
    parentId: string,
    parent: { x: number; y: number; width: number; height: number; shape?: string; arrangement: Arrangement | null; wallThicknessFt?: number },
  ): Planting[] {
    const arrangement = parent.arrangement;
    if (!arrangement || arrangement.type === 'free') return plantings;

    const bounds = getPlantableBounds(parent);
    const slots = computeSlots(arrangement, bounds);

    const children = plantings.filter((p) => p.parentId === parentId);
    const others = plantings.filter((p) => p.parentId !== parentId);

    const rearranged = children.map((p, i) =>
      i < slots.length ? { ...p, x: slots[i].x - parent.x, y: slots[i].y - parent.y } : p,
    );
    return [...others, ...rearranged];
  }

  return {
    garden: defaultGarden(),

    loadGarden: (garden) => {
      clearHistory();
      // Backfill fields for saves predating them
      for (const s of garden.structures) {
        if (s.wallThicknessFt == null) {
          s.wallThicknessFt = DEFAULT_WALL_THICKNESS_FT[s.type] ?? 0;
        }
        if (s.groupId === undefined) {
          s.groupId = null;
        }
      }
      if (!garden.seedStarting) garden.seedStarting = emptySeedStartingState();
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
      let newPlantings = mapCollection(get().garden.plantings, id, updates);
      if ('parentId' in updates) {
        const { structures, zones } = get().garden;
        const planting = get().garden.plantings.find((p) => p.id === id);
        // Rearrange target parent
        const targetParent = structures.find((s) => s.id === updates.parentId)
          ?? zones.find((z) => z.id === updates.parentId);
        if (targetParent) {
          newPlantings = rearrangePlantings(newPlantings, updates.parentId!, targetParent);
        }
        // Rearrange source parent if different
        if (planting && planting.parentId !== updates.parentId) {
          const srcParent = structures.find((s) => s.id === planting.parentId)
            ?? zones.find((z) => z.id === planting.parentId);
          if (srcParent) {
            newPlantings = rearrangePlantings(newPlantings, planting.parentId, srcParent);
          }
        }
      }
      patch({ plantings: newPlantings });
    },

    commitPlantingUpdate: (id, updates) => {
      if (isLocked('plantings')) return;
      let newPlantings = mapCollection(get().garden.plantings, id, updates);
      if ('parentId' in updates) {
        const { structures, zones } = get().garden;
        const planting = get().garden.plantings.find((p) => p.id === id);
        const targetParent = structures.find((s) => s.id === updates.parentId)
          ?? zones.find((z) => z.id === updates.parentId);
        if (targetParent) {
          newPlantings = rearrangePlantings(newPlantings, updates.parentId!, targetParent);
        }
        if (planting && planting.parentId !== updates.parentId) {
          const srcParent = structures.find((s) => s.id === planting.parentId)
            ?? zones.find((z) => z.id === planting.parentId);
          if (srcParent) {
            newPlantings = rearrangePlantings(newPlantings, planting.parentId, srcParent);
          }
        }
      }
      commitPatch({ plantings: newPlantings });
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
