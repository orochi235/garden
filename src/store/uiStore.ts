import { create } from 'zustand';
import type { LayerId } from '../model/types';
import type { TimePeriod } from '../utils/timeTheme';
import type { Season } from '../model/species';
import type { CellSize } from '../model/seedStarting';
import type { PaletteEntry } from '../components/palette/paletteData';
import type { ActiveDragPreview } from '../canvas/drag/putativeDrag';

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

/**
 * Outside-the-canvas request to mutate the garden view. Set via
 * `setGardenViewRequest`; the garden canvas's effect applies and clears it.
 *
 * - `reset` — refit the garden bounds to the canvas viewport (Cmd+0).
 * - `set-zoom` — set the zoom (px/ft) directly. The canvas keeps the world
 *   point at the canvas center fixed when applying.
 * - `set-pan` — set screen-space pan in pixels (matches the legacy uiStore
 *   `panX`/`panY` semantics: the world origin renders at (panX, panY) for
 *   the current zoom).
 */
export type GardenViewRequest =
  | { kind: 'reset' }
  | { kind: 'set-zoom'; value: number }
  | { kind: 'set-pan'; x: number; y: number };
export type LabelMode = 'all' | 'active-layer' | 'selection';
export type AppMode = 'garden' | 'seed-starting';

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
  /**
   * Read-only mirror of the garden canvas's local view state, written ONLY
   * by `GardenCanvasNewPrototype` via `setGardenViewMirror`. UI siblings of
   * the canvas (StatusBar, ScaleIndicator, ReturnToGarden, useGardenOffscreen,
   * useViewMoving) read these to render scale/zoom/return-to-garden hints.
   * Tools and gestures must NOT read these — they should plumb the view
   * through Tool ctx or a viewRef. To request an external view change (zoom
   * button, "return to garden", Cmd+0 reset), set `gardenViewRequest`; the
   * canvas consumes and clears it.
   */
  gardenZoom: number;
  gardenPanX: number;
  gardenPanY: number;
  /**
   * Transient one-shot request slot for outside-the-canvas writes to the
   * garden view. The canvas's effect picks it up, applies the change to its
   * local view state, and clears the slot. Mirrors the seed-starting
   * `seedStartingViewResetTick` pattern but with multiple request kinds in
   * one slot. Setters: `setGardenViewRequest`.
   */
  gardenViewRequest: GardenViewRequest | null;
  /**
   * Current zoom as a display percentage — written by whichever canvas is
   * active. Each canvas knows its own "100%" baseline (garden: 64 px/ft,
   * seed-starting: 30 px/in) and normalises before writing. StatusBar reads
   * this without needing to know which mode is active.
   */
  canvasZoomPct: number;
  /**
   * Unified zoom request from outside the canvas (StatusBar, keyboard). The
   * active canvas picks it up and clears the slot. `zoom-in`/`zoom-out` apply
   * a fixed ×1.25 / ×0.8 factor; `reset-fit` refits the view to content.
   */
  canvasZoomRequest: 'zoom-in' | 'zoom-out' | 'reset-fit' | null;
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
  /**
   * Transient overlap-clash signal populated by `useEricSelectTool` while a
   * structure drag is in flight. Holds the ids of non-dragging structures
   * whose AABBs intersect any dragging-set AABB so the structure highlight
   * layer can render them with a red-tinted warning. Cleared on drop / cancel.
   */
  dragClashIds: string[];
  resizeOverlay: ResizeOverlayUi | null;
  insertOverlay: InsertOverlayUi | null;
  areaSelectOverlay: AreaSelectOverlayUi | null;
  appMode: AppMode;
  currentTrayId: string | null;
  /** Transient slot: the palette writes a payload here when the user starts a
   *  drag from the seed palette. The seed-starting canvas's `usePaletteDropTool`
   *  watches this slot, takes ownership of the gesture (its own document
   *  pointer listeners + ghost), and clears the slot on commit/cancel.
   *  This replaces the previous `seedStartingZoom`/`Pan` mirror — coordinate
   *  math lives inside the canvas now. */
  palettePointerPayload: { entry: PaletteEntry; pointerEvent: PointerEvent } | null;
  /** Bumped by `resetCurrentCanvasView()` when the seed-starting canvas should
   *  re-fit its local view to the current tray. The canvas owns its view in
   *  React state; outside actors signal "please refit" by incrementing this
   *  counter rather than poking view fields directly. */
  seedStartingViewResetTick: number;
  /** Cultivar being dragged from the seed palette; null when no drag in progress. */
  seedDragCultivarId: string | null;
  /** Cultivar armed for click-to-sow in seed-starting mode. Toggled by clicking
   *  a palette planting entry; cleared by clicking it again, by Escape, or by
   *  right-click. Independent of `seedDragCultivarId` (which is set only during
   *  active palette drags). */
  armedCultivarId: string | null;
  /** Transient ghost preview shown while dragging a cultivar over a fill target. */
  seedFillPreview:
    | { trayId: string; cultivarId: string; scope: 'all'; replace?: boolean }
    | { trayId: string; cultivarId: string; scope: 'row'; index: number; replace?: boolean }
    | { trayId: string; cultivarId: string; scope: 'col'; index: number; replace?: boolean }
    | { trayId: string; cultivarId: string; scope: 'cell'; row: number; col: number; replace?: boolean }
    | null;
  /**
   * Generic putative-drag preview slot for the framework defined in
   * `src/canvas/drag/putativeDrag.ts`. Coexists with the legacy
   * `seedFillPreview` slot (the seed-fill-tray drag mirrors its putative
   * here for the legacy fill-preview layer's continued use). The
   * multi-seedling move ghost was migrated 2026-05-05; its dedicated slot
   * is gone. See `docs/TODO.md` "Repeatable putative-drag framework".
   */
  dragPreview: ActiveDragPreview | null;
  /** Seedlings hidden from normal rendering while a drag is in progress. */
  hiddenSeedlingIds: string[];
  /** Whether to highlight seedlings with warnings (goldenrod ring + hover tooltip). */
  showSeedlingWarnings: boolean;
  /**
   * Current flash/highlight opacity for selection pulses, in `[0, 1]`.
   * Defaults to 0 (no flash). The rAF-driven aggregation that writes this
   * value is a future refinement (see docs/TODO.md). Garden canvas reads this
   * so the value comes from the store rather than a hardcoded literal.
   */
  highlightOpacity: number;
  /**
   * Whether to render footprint circles on plantings. Defaults to `true` to
   * preserve existing behavior. A sidebar toggle is a future addition.
   */
  showFootprintCircles: boolean;
  /** Almanac panel filters that constrain which seedables show in the palette. */
  almanacFilters: AlmanacFilters;
  collectionEditorOpen: boolean;
  optimizerResult: import('../optimizer').OptimizationResult | null;
  optimizerResultStructureId: string | null;
  optimizerSelectedCandidate: number;
  setOptimizerResult: (r: import('../optimizer').OptimizationResult | null, structureId?: string | null) => void;
  setOptimizerSelectedCandidate: (n: number) => void;
  clearOptimizerResult: () => void;
  setCollectionEditorOpen: (open: boolean) => void;
  setShowSeedlingWarnings: (show: boolean) => void;
  setHighlightOpacity: (opacity: number) => void;
  setShowFootprintCircles: (show: boolean) => void;
  setAppMode: (mode: AppMode) => void;
  setCurrentTrayId: (id: string | null) => void;
  setPalettePointerPayload: (payload: UiStore['palettePointerPayload']) => void;
  bumpSeedStartingViewResetTick: () => void;
  setSeedDragCultivarId: (id: string | null) => void;
  setArmedCultivarId: (id: string | null) => void;
  setSeedFillPreview: (preview: UiStore['seedFillPreview']) => void;
  setDragPreview: (preview: ActiveDragPreview | null) => void;
  setHiddenSeedlingIds: (ids: string[]) => void;
  setAlmanacFilters: (filters: Partial<AlmanacFilters>) => void;
  resetAlmanacFilters: () => void;
  setDragClashIds: (ids: string[]) => void;
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
  /** Canvas-only: write the local view back to the read-only mirror. */
  setGardenViewMirror: (zoom: number, panX: number, panY: number) => void;
  /** Outside-the-canvas: request a view change. Canvas picks it up & clears. */
  setGardenViewRequest: (req: GardenViewRequest | null) => void;
  setCanvasZoomPct: (pct: number) => void;
  setCanvasZoomRequest: (req: 'zoom-in' | 'zoom-out' | 'reset-fit' | null) => void;
  reset: () => void;
}

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
    gardenZoom: 1,
    gardenPanX: 0,
    gardenPanY: 0,
    gardenViewRequest: null as GardenViewRequest | null,
    canvasZoomPct: 100,
    canvasZoomRequest: null as 'zoom-in' | 'zoom-out' | 'reset-fit' | null,
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
    dragClashIds: [] as string[],
    resizeOverlay: null as ResizeOverlayUi | null,
    insertOverlay: null as InsertOverlayUi | null,
    areaSelectOverlay: null as AreaSelectOverlayUi | null,
    appMode: readInitialAppMode(),
    currentTrayId: null as string | null,
    palettePointerPayload: null as UiStore['palettePointerPayload'],
    seedStartingViewResetTick: 0,
    seedDragCultivarId: null as string | null,
    armedCultivarId: null as string | null,
    seedFillPreview: null as UiStore['seedFillPreview'],
    dragPreview: null as ActiveDragPreview | null,
    hiddenSeedlingIds: [] as string[],
    showSeedlingWarnings: true,
    highlightOpacity: 0,
    showFootprintCircles: true,
    almanacFilters: {
      cellSizes: [],
      seasons: [],
      usdaZone: null,
      lastFrostDate: null,
    } as AlmanacFilters,
    collectionEditorOpen: readCollectionParam(),
    optimizerResult: null,
    optimizerResultStructureId: null,
    optimizerSelectedCandidate: 0,
  };
}

export const useUiStore = create<UiStore>((set) => ({
  ...defaultState(),
  setDragClashIds: (ids) => set({ dragClashIds: ids }),
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
  setGardenViewMirror: (zoom, panX, panY) =>
    set({ gardenZoom: zoom, gardenPanX: panX, gardenPanY: panY }),
  setGardenViewRequest: (req) => set({ gardenViewRequest: req }),
  setCanvasZoomPct: (pct) => set({ canvasZoomPct: pct }),
  setCanvasZoomRequest: (req) => set({ canvasZoomRequest: req }),
  setAppMode: (mode) => set({ appMode: mode }),
  setShowSeedlingWarnings: (show) => set({ showSeedlingWarnings: show }),
  setHighlightOpacity: (opacity) => set({ highlightOpacity: opacity }),
  setShowFootprintCircles: (show) => set({ showFootprintCircles: show }),
  setCurrentTrayId: (id) => set({ currentTrayId: id }),
  setPalettePointerPayload: (payload) => set({ palettePointerPayload: payload }),
  bumpSeedStartingViewResetTick: () => set((s) => ({ seedStartingViewResetTick: s.seedStartingViewResetTick + 1 })),
  setSeedDragCultivarId: (id) => set({ seedDragCultivarId: id }),
  setArmedCultivarId: (id) => set({ armedCultivarId: id }),
  setSeedFillPreview: (preview) => set({ seedFillPreview: preview }),
  setDragPreview: (preview) => set({ dragPreview: preview }),
  setHiddenSeedlingIds: (ids) => set({ hiddenSeedlingIds: ids }),
  setAlmanacFilters: (patch) =>
    set((s) => ({ almanacFilters: { ...s.almanacFilters, ...patch } })),
  resetAlmanacFilters: () =>
    set({
      almanacFilters: { cellSizes: [], seasons: [], usdaZone: null, lastFrostDate: null },
    }),
  setOptimizerResult: (r, structureId = null) => set({ optimizerResult: r, optimizerResultStructureId: r ? structureId : null, optimizerSelectedCandidate: 0 }),
  setOptimizerSelectedCandidate: (n) => set({ optimizerSelectedCandidate: n }),
  clearOptimizerResult: () => set({ optimizerResult: null, optimizerResultStructureId: null, optimizerSelectedCandidate: 0 }),
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
