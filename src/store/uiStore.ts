import { create } from 'zustand';
import type { Planting, Structure, Zone, LayerId } from '../model/types';
import type { TimePeriod } from '../utils/timeTheme';

export type ViewMode = 'select' | 'select-area' | 'pan' | 'zoom' | 'draw';
export type LabelMode = 'all' | 'active-layer' | 'selection';

export interface DragOverlay {
  layer: 'plantings' | 'structures' | 'zones';
  objects: (Planting | Structure | Zone)[];
  hideIds: string[];
  snapped: boolean;
}

type LayerRecord<T> = Record<LayerId, T>;

export interface PlottingTool {
  id: string;
  category: 'structures' | 'zones';
  type: string;
  color: string;
  pattern?: string | null;
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
  themeOverride: TimePeriod | 'live' | 'cycle' | 'slow-cycle' | null;
  layerSelectorHovered: boolean;
  showSurfaces: boolean;
  showSpacingBorders: boolean;
  showFootprintCircles: boolean;
  showMeasurements: boolean;
  showPlantableArea: boolean;
  debugOverlappingLabels: boolean;
  magentaHighlight: boolean;
  labelMode: LabelMode;
  labelFontSize: number;
  plantIconScale: number;
  layerFlashCounter: number;
  viewMode: ViewMode;
  dragOverlay: DragOverlay | null;
  setDragOverlay: (overlay: DragOverlay) => void;
  clearDragOverlay: () => void;
  setLayerSelectorHovered: (hovered: boolean) => void;
  setShowSurfaces: (show: boolean) => void;
  setShowSpacingBorders: (show: boolean) => void;
  setShowFootprintCircles: (show: boolean) => void;
  setShowMeasurements: (show: boolean) => void;
  setShowPlantableArea: (show: boolean) => void;
  setDebugOverlappingLabels: (show: boolean) => void;
  setMagentaHighlight: (show: boolean) => void;
  setLabelMode: (mode: LabelMode) => void;
  setLabelFontSize: (size: number) => void;
  setPlantIconScale: (scale: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setPlottingTool: (tool: PlottingTool | null) => void;
  setThemeOverride: (period: TimePeriod | 'live' | 'cycle' | 'slow-cycle' | null) => void;
  setActiveLayer: (layer: LayerId, flash?: boolean) => void;
  setLayerVisible: (layer: LayerId, visible: boolean) => void;
  setLayerOpacity: (layer: LayerId, opacity: number) => void;
  setLayerLocked: (layer: LayerId, locked: boolean) => void;
  select: (id: string) => void;
  addToSelection: (id: string) => void;
  setSelection: (ids: string[]) => void;
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
  themeOverride: 'live',
  layerSelectorHovered: false,
  showSurfaces: false,
  showSpacingBorders: true,
  showFootprintCircles: true,
  showMeasurements: false,
  showPlantableArea: false,
  debugOverlappingLabels: false,
  magentaHighlight: false,
  labelMode: 'selection' as LabelMode,
  labelFontSize: 13,
  plantIconScale: 1,
  layerFlashCounter: 0,
  viewMode: 'select',
  dragOverlay: null,
  setDragOverlay: (overlay) => set({ dragOverlay: overlay }),
  clearDragOverlay: () => set({ dragOverlay: null }),
  setLayerSelectorHovered: (hovered) => set({ layerSelectorHovered: hovered }),
  setShowSurfaces: (show) => set({ showSurfaces: show }),
  setShowSpacingBorders: (show) => set({ showSpacingBorders: show }),
  setShowFootprintCircles: (show) => set({ showFootprintCircles: show }),
  setShowMeasurements: (show) => set({ showMeasurements: show }),
  setShowPlantableArea: (show) => set({ showPlantableArea: show }),
  setDebugOverlappingLabels: (show) => set({ debugOverlappingLabels: show }),
  setMagentaHighlight: (show) => set({ magentaHighlight: show }),
  setLabelMode: (mode) => set({ labelMode: mode }),
  setLabelFontSize: (size) => set({ labelFontSize: size }),
  setPlantIconScale: (scale) => set({ plantIconScale: scale }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setPlottingTool: (tool) => set({ plottingTool: tool }),
  setThemeOverride: (period) => set({ themeOverride: period }),
  setActiveLayer: (layer, flash) => set((s) => ({
    activeLayer: layer,
    layerFlashCounter: flash ? s.layerFlashCounter + 1 : s.layerFlashCounter,
  })),
  setLayerVisible: (layer, visible) =>
    set((state) => {
      if (!visible && state.activeLayer === layer) return state;
      return { layerVisibility: { ...state.layerVisibility, [layer]: visible } };
    }),
  setLayerOpacity: (layer, opacity) =>
    set((state) => ({ layerOpacity: { ...state.layerOpacity, [layer]: opacity } })),
  setLayerLocked: (layer, locked) =>
    set((state) => ({ layerLocked: { ...state.layerLocked, [layer]: locked } })),
  select: (id) => set({ selectedIds: [id] }),
  addToSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id) ? state.selectedIds : [...state.selectedIds, id],
    })),
  setSelection: (ids) => set({ selectedIds: ids }),
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
      themeOverride: 'live',
      layerSelectorHovered: false,
      showSurfaces: false,
      showSpacingBorders: true,
      showFootprintCircles: true,
      showMeasurements: false,
      showPlantableArea: false,
      debugOverlappingLabels: false,
      magentaHighlight: false,
      labelMode: 'selection' as LabelMode,
      labelFontSize: 13,
      plantIconScale: 1,
      layerFlashCounter: 0,
      viewMode: 'select',
      dragOverlay: null,
    }),
}));
