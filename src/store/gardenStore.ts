import { create } from 'zustand';
import type { Garden, Structure, Zone, Planting, Blueprint } from '../model/types';
import { createGarden, createStructure, createZone, createPlanting } from '../model/types';

interface GardenStore {
  garden: Garden;
  updateGarden: (updates: Partial<Pick<Garden, 'name' | 'widthFt' | 'heightFt' | 'gridCellSizeFt' | 'displayUnit'>>) => void;
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
}

function defaultGarden(): Garden {
  return createGarden({ name: 'My Garden', widthFt: 20, heightFt: 20 });
}

export const useGardenStore = create<GardenStore>((set) => ({
  garden: defaultGarden(),
  updateGarden: (updates) => set((state) => ({ garden: { ...state.garden, ...updates } })),
  loadGarden: (garden) => set({ garden }),
  reset: () => set({ garden: defaultGarden() }),
  setBlueprint: (blueprint) => set((state) => ({ garden: { ...state.garden, blueprint } })),
  addStructure: (opts) => set((state) => ({ garden: { ...state.garden, structures: [...state.garden.structures, createStructure(opts)] } })),
  updateStructure: (id, updates) => set((state) => ({ garden: { ...state.garden, structures: state.garden.structures.map((s) => s.id === id ? { ...s, ...updates } : s) } })),
  removeStructure: (id) => set((state) => ({ garden: { ...state.garden, structures: state.garden.structures.filter((s) => s.id !== id) } })),
  addZone: (opts) => set((state) => ({ garden: { ...state.garden, zones: [...state.garden.zones, createZone(opts)] } })),
  updateZone: (id, updates) => set((state) => ({ garden: { ...state.garden, zones: state.garden.zones.map((z) => z.id === id ? { ...z, ...updates } : z) } })),
  removeZone: (id) => set((state) => ({ garden: { ...state.garden, zones: state.garden.zones.filter((z) => z.id !== id), plantings: state.garden.plantings.filter((p) => p.zoneId !== id) } })),
  addPlanting: (opts) => set((state) => ({ garden: { ...state.garden, plantings: [...state.garden.plantings, createPlanting(opts)] } })),
  updatePlanting: (id, updates) => set((state) => ({ garden: { ...state.garden, plantings: state.garden.plantings.map((p) => p.id === id ? { ...p, ...updates } : p) } })),
  removePlanting: (id) => set((state) => ({ garden: { ...state.garden, plantings: state.garden.plantings.filter((p) => p.id !== id) } })),
}));
