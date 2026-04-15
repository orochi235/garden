import { create } from 'zustand';
import type { Garden, Structure, Zone, Planting, Blueprint } from '../model/types';
import { createGarden, createStructure, createZone, createPlanting } from '../model/types';
import { pushHistory, undo, redo, canUndo, canRedo, clearHistory } from './history';

interface GardenStore {
  garden: Garden;
  updateGarden: (updates: Partial<Pick<Garden, 'name' | 'widthFt' | 'heightFt' | 'gridCellSizeFt' | 'displayUnit' | 'groundColor'>>) => void;
  loadGarden: (garden: Garden) => void;
  reset: () => void;
  setBlueprint: (blueprint: Blueprint | null) => void;
  addStructure: (opts: { type: string; x: number; y: number; width: number; height: number }) => void;
  updateStructure: (id: string, updates: Partial<Omit<Structure, 'id'>>) => void;
  removeStructure: (id: string) => void;
  addZone: (opts: { x: number; y: number; width: number; height: number }) => void;
  updateZone: (id: string, updates: Partial<Omit<Zone, 'id'>>) => void;
  removeZone: (id: string) => void;
  addPlanting: (opts: { zoneId: string; x: number; y: number; name: string }) => void;
  updatePlanting: (id: string, updates: Partial<Omit<Planting, 'id'>>) => void;
  removePlanting: (id: string) => void;
  /** Save current state to history stack. Call before a batch of changes that should be one undo step. */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function defaultGarden(): Garden {
  return createGarden({ name: 'My Garden', widthFt: 20, heightFt: 20 });
}

/** Helper: push history before mutating */
function withHistory(state: { garden: Garden }) {
  pushHistory(state.garden);
}

export const useGardenStore = create<GardenStore>((set, get) => ({
  garden: defaultGarden(),
  updateGarden: (updates) => { withHistory(get()); set((state) => ({ garden: { ...state.garden, ...updates } })); },
  loadGarden: (garden) => { clearHistory(); set({ garden }); },
  reset: () => { clearHistory(); set({ garden: defaultGarden() }); },
  setBlueprint: (blueprint) => { withHistory(get()); set((state) => ({ garden: { ...state.garden, blueprint } })); },
  addStructure: (opts) => { withHistory(get()); set((state) => ({ garden: { ...state.garden, structures: [...state.garden.structures, createStructure(opts)] } })); },
  updateStructure: (id, updates) => set((state) => ({ garden: { ...state.garden, structures: state.garden.structures.map((s) => s.id === id ? { ...s, ...updates } : s) } })),
  removeStructure: (id) => { withHistory(get()); set((state) => ({ garden: { ...state.garden, structures: state.garden.structures.filter((s) => s.id !== id) } })); },
  addZone: (opts) => { withHistory(get()); set((state) => ({ garden: { ...state.garden, zones: [...state.garden.zones, createZone(opts)] } })); },
  updateZone: (id, updates) => set((state) => ({ garden: { ...state.garden, zones: state.garden.zones.map((z) => z.id === id ? { ...z, ...updates } : z) } })),
  removeZone: (id) => { withHistory(get()); set((state) => ({ garden: { ...state.garden, zones: state.garden.zones.filter((z) => z.id !== id), plantings: state.garden.plantings.filter((p) => p.zoneId !== id) } })); },
  addPlanting: (opts) => { withHistory(get()); set((state) => ({ garden: { ...state.garden, plantings: [...state.garden.plantings, createPlanting(opts)] } })); },
  updatePlanting: (id, updates) => set((state) => ({ garden: { ...state.garden, plantings: state.garden.plantings.map((p) => p.id === id ? { ...p, ...updates } : p) } })),
  removePlanting: (id) => { withHistory(get()); set((state) => ({ garden: { ...state.garden, plantings: state.garden.plantings.filter((p) => p.id !== id) } })); },
  checkpoint: () => { pushHistory(get().garden); },
  undo: () => { const prev = undo(get().garden); if (prev) set({ garden: prev }); },
  redo: () => { const next = redo(get().garden); if (next) set({ garden: next }); },
  canUndo: () => canUndo(),
  canRedo: () => canRedo(),
}));
