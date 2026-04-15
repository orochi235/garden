import { create } from 'zustand';
import type { LayerId } from '../model/types';

type LayerRecord<T> = Record<LayerId, T>;

interface DragState {
  isDragging: boolean;
  dragType: 'palette' | 'move' | 'resize' | null;
  dragObjectType: string | null;
  dragStartX: number;
  dragStartY: number;
  dragCurrentX: number;
  dragCurrentY: number;
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
  drag: DragState;
  setActiveLayer: (layer: LayerId) => void;
  setLayerVisible: (layer: LayerId, visible: boolean) => void;
  setLayerOpacity: (layer: LayerId, opacity: number) => void;
  setLayerLocked: (layer: LayerId, locked: boolean) => void;
  select: (id: string) => void;
  addToSelection: (id: string) => void;
  clearSelection: () => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  setDrag: (drag: Partial<DragState>) => void;
  clearDrag: () => void;
  reset: () => void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

function defaultLayerRecord<T>(value: T): LayerRecord<T> {
  return { ground: value, blueprint: value, structures: value, zones: value, plantings: value };
}

const defaultDrag: DragState = {
  isDragging: false, dragType: null, dragObjectType: null,
  dragStartX: 0, dragStartY: 0, dragCurrentX: 0, dragCurrentY: 0,
};

export const useUiStore = create<UiStore>((set) => ({
  activeLayer: 'structures',
  layerVisibility: defaultLayerRecord(true),
  layerOpacity: defaultLayerRecord(1),
  layerLocked: defaultLayerRecord(false),
  selectedIds: [],
  zoom: 1,
  panX: 0,
  panY: 0,
  drag: { ...defaultDrag },
  setActiveLayer: (layer) => set({ activeLayer: layer }),
  setLayerVisible: (layer, visible) => set((state) => ({ layerVisibility: { ...state.layerVisibility, [layer]: visible } })),
  setLayerOpacity: (layer, opacity) => set((state) => ({ layerOpacity: { ...state.layerOpacity, [layer]: opacity } })),
  setLayerLocked: (layer, locked) => set((state) => ({ layerLocked: { ...state.layerLocked, [layer]: locked } })),
  select: (id) => set({ selectedIds: [id] }),
  addToSelection: (id) => set((state) => ({ selectedIds: state.selectedIds.includes(id) ? state.selectedIds : [...state.selectedIds, id] })),
  clearSelection: () => set({ selectedIds: [] }),
  setZoom: (zoom) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  setDrag: (drag) => set((state) => ({ drag: { ...state.drag, ...drag } })),
  clearDrag: () => set({ drag: { ...defaultDrag } }),
  reset: () => set({
    activeLayer: 'structures', layerVisibility: defaultLayerRecord(true),
    layerOpacity: defaultLayerRecord(1), layerLocked: defaultLayerRecord(false),
    selectedIds: [], zoom: 1, panX: 0, panY: 0, drag: { ...defaultDrag },
  }),
}));
