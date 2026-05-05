import { create } from 'zustand';
import type { Planting, Structure, Zone, LayerId } from '../model/types';
import type { TimePeriod } from '../utils/timeTheme';
import type { Season } from '../model/species';
import type { CellSize } from '../model/seedStarting';

export interface AlmanacFilters {
  /** When non-empty, only seedables with one of these cell sizes are shown. */
  cellSizes: CellSize[];
  /** When non-empty, only seedables with one of these seasons are shown. */
  seasons: Season[];
  /** When set, only seedables whose USDA zone range covers this zone are shown. */
  usdaZone: number | null;
  /** ISO date string (YYYY-MM-DD). Filters by intended planting / sow window. Null = ignore. */
  lastFrostDate: string | null;
}

export type ViewMode = 'select' | 'select-area' | 'pan' | 'zoom' | 'draw';
export type LabelMode = 'all' | 'active-layer' | 'selection';
export type AppMode = 'garden' | 'seed-starting';

export interface DragOverlay {
  layer: 'plantings' | 'structures' | 'zones';
  objects: (Planting | Structure | Zone)[];
  hideIds: string[];
  snapped: boolean;
}

export interface ResizeOverlayUi {
  id: string;
  layer: 'structures' | 'zones';
  currentPose: { x: number; y: number; width: number; height: number };
  targetPose: { x: number; y: number; width: number; height: number };
}

export interface InsertOverlayUi {
  start: { x: number; y: number };
  current: { x: number; y: number };
}

export interface AreaSelectOverlayUi {
  start: { worldX: number; worldY: number };
  current: { worldX: number; worldY: number };
  shiftHeld: boolean;
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
  themeOverride: TimePeriod | 'cycle' | 'slow-cycle' | null;
  layerSelectorHovered: boolean;
  renderLayerVisibility: Record<string, boolean>;
  renderLayerOrder: Record<string, string[]>;
  debugOverlappingLabels: boolean;
  labelMode: LabelMode;
  labelFontSize: number;
  plantIconScale: number;
  layerFlashCounter: number;
  viewMode: ViewMode;
  dragOverlay: DragOverlay | null;
  resizeOverlay: ResizeOverlayUi | null;
  insertOverlay: InsertOverlayUi | null;
  areaSelectOverlay: AreaSelectOverlayUi | null;
  appMode: AppMode;
  currentTrayId: string | null;
  /** Per-mode view state for the seed-starting canvas (pixels per inch). */
  seedStartingZoom: number;
  seedStartingPanX: number;
  seedStartingPanY: number;
  /** Cultivar being dragged from the seed palette; null when no drag in progress. */
  seedDragCultivarId: string | null;
  /** Transient ghost preview shown while dragging a cultivar over a fill target. */
  seedFillPreview:
    | { trayId: string; cultivarId: string; scope: 'all'; replace?: boolean }
    | { trayId: string; cultivarId: string; scope: 'row'; index: number; replace?: boolean }
    | { trayId: string; cultivarId: string; scope: 'col'; index: number; replace?: boolean }
    | { trayId: string; cultivarId: string; scope: 'cell'; row: number; col: number; replace?: boolean }
    | null;
  /** Multi-seedling move preview: ghosted icons in their resolved target cells. */
  seedMovePreview: {
    trayId: string;
    cells: Array<{ row: number; col: number; cultivarId: string; bumped: boolean }>;
    feasible: boolean;
  } | null;
  /** Seedlings hidden from normal rendering while a drag is in progress. */
  hiddenSeedlingIds: string[];
  /** Whether to highlight seedlings with warnings (goldenrod ring + hover tooltip). */
  showSeedlingWarnings: boolean;
  /** Almanac panel filters that constrain which seedables show in the palette. */
  almanacFilters: AlmanacFilters;
  collectionEditorOpen: boolean;
  setCollectionEditorOpen: (open: boolean) => void;
  setShowSeedlingWarnings: (show: boolean) => void;
  setAppMode: (mode: AppMode) => void;
  setCurrentTrayId: (id: string | null) => void;
  setSeedStartingZoom: (zoom: number) => void;
  setSeedStartingPan: (x: number, y: number) => void;
  setSeedDragCultivarId: (id: string | null) => void;
  setSeedFillPreview: (preview: UiStore['seedFillPreview']) => void;
  setSeedMovePreview: (preview: UiStore['seedMovePreview']) => void;
  setHiddenSeedlingIds: (ids: string[]) => void;
  setAlmanacFilters: (filters: Partial<AlmanacFilters>) => void;
  resetAlmanacFilters: () => void;
  setDragOverlay: (overlay: DragOverlay) => void;
  clearDragOverlay: () => void;
  setResizeOverlay: (overlay: ResizeOverlayUi | null) => void;
  setInsertOverlay: (overlay: InsertOverlayUi | null) => void;
  setAreaSelectOverlay: (overlay: AreaSelectOverlayUi | null) => void;
  setLayerSelectorHovered: (hovered: boolean) => void;
  setRenderLayerVisible: (layerId: string, visible: boolean) => void;
  setRenderLayerOrder: (renderer: string, order: string[]) => void;
  setDebugOverlappingLabels: (show: boolean) => void;
  setLabelMode: (mode: LabelMode) => void;
  setLabelFontSize: (size: number) => void;
  setPlantIconScale: (scale: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setPlottingTool: (tool: PlottingTool | null) => void;
  setThemeOverride: (period: TimePeriod | 'cycle' | 'slow-cycle' | null) => void;
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
const SEED_MIN_ZOOM = 5;
const SEED_MAX_ZOOM = 100;

function defaultLayerRecord<T>(value: T): LayerRecord<T> {
  return { ground: value, blueprint: value, structures: value, zones: value, plantings: value };
}

function readCollectionParam(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('collection')) return false;
  const v = params.get('collection');
  return v !== 'false' && v !== '0' && v !== 'null';
}

function readInitialAppMode(): AppMode {
  if (typeof window === 'undefined') return 'garden';
  const mode = new URLSearchParams(window.location.search).get('mode');
  return mode === 'seed-starting' ? 'seed-starting' : 'garden';
}

function defaultState() {
  return {
    activeLayer: 'structures' as LayerId,
    layerVisibility: defaultLayerRecord(true),
    layerOpacity: defaultLayerRecord(1),
    layerLocked: defaultLayerRecord(false),
    selectedIds: [] as string[],
    zoom: 1,
    panX: 0,
    panY: 0,
    plottingTool: null as PlottingTool | null,
    themeOverride: null as UiStore['themeOverride'],
    layerSelectorHovered: false,
    renderLayerVisibility: {
      'structure-surfaces': false,
      'structure-plantable-area': false,
      'planting-measurements': false,
      'seedling-labels': false,
      'tray-grid': true,
    } as Record<string, boolean>,
    renderLayerOrder: {} as Record<string, string[]>,
    debugOverlappingLabels: false,
    labelMode: 'selection' as LabelMode,
    labelFontSize: 13,
    plantIconScale: 1,
    layerFlashCounter: 0,
    viewMode: 'select' as ViewMode,
    dragOverlay: null as DragOverlay | null,
    resizeOverlay: null as ResizeOverlayUi | null,
    insertOverlay: null as InsertOverlayUi | null,
    areaSelectOverlay: null as AreaSelectOverlayUi | null,
    appMode: readInitialAppMode(),
    currentTrayId: null as string | null,
    seedStartingZoom: 30,
    seedStartingPanX: 0,
    seedStartingPanY: 0,
    seedDragCultivarId: null as string | null,
    seedFillPreview: null as UiStore['seedFillPreview'],
    seedMovePreview: null as UiStore['seedMovePreview'],
    hiddenSeedlingIds: [] as string[],
    showSeedlingWarnings: true,
    almanacFilters: {
      cellSizes: [],
      seasons: [],
      usdaZone: null,
      lastFrostDate: null,
    } as AlmanacFilters,
    collectionEditorOpen: readCollectionParam(),
  };
}

export const useUiStore = create<UiStore>((set) => ({
  ...defaultState(),
  setDragOverlay: (overlay) => set({ dragOverlay: overlay }),
  clearDragOverlay: () => set({ dragOverlay: null }),
  setResizeOverlay: (overlay) => set({ resizeOverlay: overlay }),
  setInsertOverlay: (overlay) => set({ insertOverlay: overlay }),
  setAreaSelectOverlay: (overlay) => set({ areaSelectOverlay: overlay }),
  setLayerSelectorHovered: (hovered) => set({ layerSelectorHovered: hovered }),
  setRenderLayerVisible: (layerId, visible) =>
    set((state) => ({
      renderLayerVisibility: { ...state.renderLayerVisibility, [layerId]: visible },
    })),
  setRenderLayerOrder: (renderer, order) =>
    set((state) => ({
      renderLayerOrder: { ...state.renderLayerOrder, [renderer]: order },
    })),
  setDebugOverlappingLabels: (show) => set({ debugOverlappingLabels: show }),
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
  setAppMode: (mode) => set({ appMode: mode }),
  setShowSeedlingWarnings: (show) => set({ showSeedlingWarnings: show }),
  setCurrentTrayId: (id) => set({ currentTrayId: id }),
  setSeedStartingZoom: (z) => set({ seedStartingZoom: Math.min(SEED_MAX_ZOOM, Math.max(SEED_MIN_ZOOM, z)) }),
  setSeedStartingPan: (x, y) => set({ seedStartingPanX: x, seedStartingPanY: y }),
  setSeedDragCultivarId: (id) => set({ seedDragCultivarId: id }),
  setSeedFillPreview: (preview) => set({ seedFillPreview: preview }),
  setSeedMovePreview: (preview) => set({ seedMovePreview: preview }),
  setHiddenSeedlingIds: (ids) => set({ hiddenSeedlingIds: ids }),
  setAlmanacFilters: (patch) =>
    set((s) => ({ almanacFilters: { ...s.almanacFilters, ...patch } })),
  resetAlmanacFilters: () =>
    set({
      almanacFilters: { cellSizes: [], seasons: [], usdaZone: null, lastFrostDate: null },
    }),
  setCollectionEditorOpen: (open) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (open) url.searchParams.set('collection', '1');
      else url.searchParams.delete('collection');
      window.history.replaceState({}, '', url);
    }
    set({ collectionEditorOpen: open });
  },
  reset: () => set(defaultState()),
}));
