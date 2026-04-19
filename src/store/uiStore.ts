import { create } from 'zustand';
import type { LayerId } from '../model/types';
import type { TimePeriod } from '../utils/timeTheme';

export type ViewMode = 'select' | 'pan' | 'zoom' | 'draw';

type LayerRecord<T> = Record<LayerId, T>;

export interface PlottingTool {
  id: string;
  category: 'structures' | 'zones';
  type: string;
  color: string;
}

interface UiStore {
  activeLayer: LayerId;
  layerVisibility: LayerRecord<boolean>;
  layerOpacity: LayerRecord<number>;
  layerLocked: LayerRecord<boolean>;
  selectedIds: string[];
  zoom: number;
  panX: number;
  panY: number;
  plottingTool: PlottingTool | null;
  themeOverride: TimePeriod | 'cycle' | 'slow-cycle' | null;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  setPlottingTool: (tool: PlottingTool | null) => void;
  setThemeOverride: (period: TimePeriod | 'cycle' | 'slow-cycle' | null) => void;
  setActiveLayer: (layer: LayerId) => void;
  setLayerVisible: (layer: LayerId, visible: boolean) => void;
  setLayerOpacity: (layer: LayerId, opacity: number) => void;
  setLayerLocked: (layer: LayerId, locked: boolean) => void;
  select: (id: string) => void;
  addToSelection: (id: string) => void;
  clearSelection: () => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  reset: () => void;
}

const MIN_ZOOM = 10;
const MAX_ZOOM = 200;

function defaultLayerRecord<T>(value: T): LayerRecord<T> {
  return { ground: value, blueprint: value, structures: value, zones: value, plantings: value };
}

export const useUiStore = create<UiStore>((set) => ({
  activeLayer: 'structures',
  layerVisibility: defaultLayerRecord(true),
  layerOpacity: defaultLayerRecord(1),
  layerLocked: defaultLayerRecord(false),
  selectedIds: [],
  zoom: 1,
  panX: 0,
  panY: 0,
  plottingTool: null,
  themeOverride: null,
  viewMode: 'select',
  setViewMode: (mode) => set({ viewMode: mode }),
  setPlottingTool: (tool) => set({ plottingTool: tool }),
  setThemeOverride: (period) => set({ themeOverride: period }),
  setActiveLayer: (layer) => set({ activeLayer: layer }),
  setLayerVisible: (layer, visible) =>
    set((state) => ({ layerVisibility: { ...state.layerVisibility, [layer]: visible } })),
  setLayerOpacity: (layer, opacity) =>
    set((state) => ({ layerOpacity: { ...state.layerOpacity, [layer]: opacity } })),
  setLayerLocked: (layer, locked) =>
    set((state) => ({ layerLocked: { ...state.layerLocked, [layer]: locked } })),
  select: (id) => set({ selectedIds: [id] }),
  addToSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id) ? state.selectedIds : [...state.selectedIds, id],
    })),
  clearSelection: () => set({ selectedIds: [] }),
  setZoom: (zoom) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  reset: () =>
    set({
      activeLayer: 'structures',
      layerVisibility: defaultLayerRecord(true),
      layerOpacity: defaultLayerRecord(1),
      layerLocked: defaultLayerRecord(false),
      selectedIds: [],
      zoom: 1,
      panX: 0,
      panY: 0,
      plottingTool: null,
      themeOverride: null,
      viewMode: 'select',
    }),
}));
