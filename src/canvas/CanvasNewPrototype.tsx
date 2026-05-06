import { useEffect, useMemo, useRef, useState } from 'react';
import { onIconLoad } from './plantRenderers';
import {
  Canvas,
  computeFitView,
  useCanvasSize,
  useInsertTool,
  useTools,
} from '@orochi235/weasel';
import type { GridSlotConfig } from '@orochi235/weasel';
import { useEricWheelZoomTool } from './tools/useEricWheelZoomTool';
import { useEricClickZoomTool } from './tools/useEricClickZoomTool';
import type { RenderLayer } from '@orochi235/weasel';
import { createInsertAdapter } from './adapters/insert';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { useHighlightStore, useHighlightTick } from '../store/highlightStore';
import { createGardenSceneAdapter, type SceneNode, type ScenePose } from './adapters/gardenScene';
import { createStructureLayers } from './layers/structureLayersWorld';
import { createZoneLayers } from './layers/zoneLayersWorld';
import { createPlantingLayers } from './layers/plantingLayersWorld';
import {
  createSelectionOutlineLayer,
  createSelectionHandlesLayer,
  createGroupOutlineLayer,
  createAllHandlesLayer,
} from './layers/selectionLayersWorld';
import { isDebugEnabled } from './debug';
import { createSystemLayers } from './layers/systemLayersWorld';
import type { GetUi, View } from './layers/worldLayerData';
import { useEricSelectTool } from './tools/useEricSelectTool';
import { useEricCycleTool } from './tools/useEricCycleTool';
import { useEricRightDragPan } from './tools/useEricRightDragPan';
import { useEricLeftDragPanTool } from './tools/useEricLeftDragPanTool';
import { useGardenPaletteDropTool } from './tools/useGardenPaletteDropTool';
import { createDragPreviewLayer } from './drag/dragPreviewLayer';
import { createGardenPaletteDrag } from './drag/gardenPaletteDrag';
import { createMoveDrag, MOVE_DRAG_KIND } from './drag/moveDrag';
import { createResizeDrag, RESIZE_DRAG_KIND } from './drag/resizeDrag';
import { createPlotDrag, PLOT_DRAG_KIND, type PlotPutative } from './drag/plotDrag';
import { createAreaSelectDrag, AREA_SELECT_DRAG_KIND } from './drag/areaSelectDrag';
import { SeedStartingCanvasNewPrototype } from './SeedStartingCanvasNewPrototype';
import { wrapLayersWithVisibility } from './layers/visibilityWrap';
import { createDebugLayers } from './layers/debugLayers';
import { setRegisteredLayers } from './layers/renderLayerRegistry';
import { createOptimizerGhostLayer } from './layers/optimizerGhostLayer';
import { createOptimizerClusterRegionsLayer } from './layers/optimizerClusterRegionsLayer';

export function CanvasNewPrototype() {
  const appMode = useUiStore((s) => s.appMode);
  if (appMode === 'seed-starting') return <SeedStartingCanvasNewPrototype />;
  return <GardenCanvasNewPrototype />;
}

// Garden canvas zoom bounds (px-per-foot). Same range we historically clamped
// in `useUiStore.setZoom`; preserved at the canvas now that view state lives
// locally.
const GARDEN_MIN_ZOOM = 10;
const GARDEN_MAX_ZOOM = 200;

function clampZoom(z: number): number {
  return Math.min(GARDEN_MAX_ZOOM, Math.max(GARDEN_MIN_ZOOM, z));
}

function GardenCanvasNewPrototype() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useCanvasSize(containerRef);
  const garden = useGardenStore((s) => s.garden);

  // Subscribe so React re-renders when these change. The closures below
  // re-read on every paint, so the actual values flow through that path.
  useUiStore((s) => s.selectedIds);
  useUiStore((s) => s.labelMode);
  useUiStore((s) => s.labelFontSize);
  useUiStore((s) => s.plantIconScale);
  useUiStore((s) => s.debugOverlappingLabels);
  useUiStore((s) => s.renderLayerVisibility);
  useUiStore((s) => s.dragClashIds);
  useUiStore((s) => s.highlightOpacity);
  useUiStore((s) => s.showFootprintCircles);
  useUiStore((s) => s.optimizerResult);
  useUiStore((s) => s.optimizerSelectedCandidate);
  useUiStore((s) => s.dragPreview);
  // Pulse → re-render layers while flashes are active.
  useHighlightTick();

  const [, setIconTick] = useState(0);
  useEffect(() => onIconLoad(() => setIconTick((t) => t + 1)), []);

  const adapter = useMemo(() => createGardenSceneAdapter(), []);
  const insertAdapter = useMemo(() => createInsertAdapter(), []);

  // View state lives locally — the canvas owns its viewport. UI siblings
  // (StatusBar, ScaleIndicator, ReturnToGarden, useGardenOffscreen,
  // useViewMoving) read a write-only mirror in `useUiStore.gardenZoom/PanX/PanY`
  // that we keep in sync via `setGardenViewMirror` below. Outside actors
  // (Cmd+0 reset, StatusBar zoom buttons, ReturnToGarden) request changes by
  // setting `useUiStore.gardenViewRequest`; the effect below applies and
  // clears it. Tools (wheel-zoom, drag-pan, click-zoom) talk to the canvas
  // through Tool ctx (`ctx.view`/`ctx.setView`) and never read the store.
  // Internally we use kit's screen-space {zoom, panX, panY} representation
  // (matching the legacy uiStore shape) and convert to the kit's camera-coord
  // `View` ({x, y, scale}) at the boundary.
  const [zoom, setZoomState] = useState(0);
  const [panX, setPanXState] = useState(0);
  const [panY, setPanYState] = useState(0);

  // Mirror to a ref so non-React readers (the palette drop tool's document
  // pointer pipeline) can read the latest view without re-attaching listeners.
  const viewRef = useRef<View>({ x: 0, y: 0, scale: 1 });
  useEffect(() => {
    viewRef.current =
      zoom > 0
        ? { x: -panX / zoom, y: -panY / zoom, scale: zoom }
        : { x: 0, y: 0, scale: 1 };
  }, [zoom, panX, panY]);

  // Mirror local view → ui store so sibling UI components can read it.
  useEffect(() => {
    if (zoom <= 0) return;
    useUiStore.getState().setGardenViewMirror(zoom, panX, panY);
  }, [zoom, panX, panY]);

  // Initial fit. Re-runs only when width/height/garden bounds change AND we
  // haven't fit yet (or the canvas just got non-zero size).
  const didFitRef = useRef(false);
  useEffect(() => {
    if (didFitRef.current) return;
    if (width === 0 || height === 0) return;
    didFitRef.current = true;
    const fit = computeFitView(width, height, garden.widthFt, garden.lengthFt);
    setZoomState(clampZoom(fit.zoom));
    setPanXState(fit.panX);
    setPanYState(fit.panY);
  }, [width, height, garden.widthFt, garden.lengthFt]);

  // External view requests (Cmd+0 reset, StatusBar zoom buttons,
  // ReturnToGarden setPan). Subscribe imperatively so we react to every
  // request — even rapid ones that would coalesce in a render-cycle reader.
  useEffect(() => {
    const unsub = useUiStore.subscribe((state, prev) => {
      const req = state.gardenViewRequest;
      if (req === prev.gardenViewRequest) return;
      if (!req) return;
      // Apply.
      if (req.kind === 'reset') {
        const w = containerRef.current?.clientWidth ?? width;
        const h = containerRef.current?.clientHeight ?? height;
        if (w > 0 && h > 0) {
          const fit = computeFitView(w, h, useGardenStore.getState().garden.widthFt, useGardenStore.getState().garden.lengthFt);
          setZoomState(clampZoom(fit.zoom));
          setPanXState(fit.panX);
          setPanYState(fit.panY);
        }
      } else if (req.kind === 'set-zoom') {
        setZoomState(clampZoom(req.value));
      } else if (req.kind === 'set-pan') {
        setPanXState(req.x);
        setPanYState(req.y);
      }
      // Clear the slot so the same request can fire again later.
      useUiStore.getState().setGardenViewRequest(null);
    });
    return unsub;
  }, [width, height]);

  const gridCellSizeFt = useGardenStore((s) => s.garden.gridCellSizeFt);

  const layers = useMemo(() => {
    const getStructures = () => useGardenStore.getState().garden.structures;
    const getZones = () => useGardenStore.getState().garden.zones;
    // Hide existing plantings of the bed currently showing an optimizer
    // preview, so the ghost layout reads cleanly without the prior contents
    // bleeding through.
    const getPlantings = () => {
      const all = useGardenStore.getState().garden.plantings;
      const previewBedId = useUiStore.getState().optimizerResultStructureId;
      if (!previewBedId) return all;
      return all.filter((p) => p.parentId !== previewBedId);
    };
    const getUi: GetUi = () => {
      const u = useUiStore.getState();
      // Per-id flash opacity — layers call `getHighlight(id)` per entity. The
      // highlight store already keys flashes/hovers by id; we just pass the
      // reader through so each layer can pulse independently.
      const getHighlight = (id: string) => useHighlightStore.getState().computeOpacity(id);
      return {
        selectedIds: u.selectedIds,
        labelMode: u.labelMode,
        labelFontSize: u.labelFontSize,
        plantIconScale: u.plantIconScale,
        showFootprintCircles: u.showFootprintCircles,
        getHighlight,
        debugOverlappingLabels: u.debugOverlappingLabels,
        dragClashIds: u.dragClashIds,
      };
    };

    // Putative-drag preview layer — Phase 2 dispatches to the
    // garden-palette-plant drag (cursor-following ghost during palette →
    // garden plantings drop) and the eric-move drag (per-id ghost layout +
    // snap-target outline during structure / zone / planting moves).
    const dragPreviewRegistry = {
      [createGardenPaletteDrag({ getEntry: () => null }).kind]:
        createGardenPaletteDrag({ getEntry: () => null }),
      [MOVE_DRAG_KIND]: createMoveDrag(),
      [RESIZE_DRAG_KIND]: createResizeDrag(),
      [PLOT_DRAG_KIND]: createPlotDrag(),
      [AREA_SELECT_DRAG_KIND]: createAreaSelectDrag(),
    };
    const baseList: RenderLayer<unknown>[] = [
      ...createZoneLayers(getZones, getUi),
      ...createStructureLayers(getStructures, getUi),
      ...createPlantingLayers(getPlantings, getZones, getStructures, getUi),
      createDragPreviewLayer(dragPreviewRegistry as never),
      createOptimizerGhostLayer(
        getStructures,
        () => {
          const u = useUiStore.getState();
          return {
            result: u.optimizerResult,
            selectedCandidate: u.optimizerSelectedCandidate,
            structureId: u.optimizerResultStructureId,
          };
        },
      ),
      createGroupOutlineLayer(getStructures, getUi),
      createSelectionOutlineLayer(getPlantings, getZones, getStructures, getUi),
      createSelectionHandlesLayer(getZones, getStructures, getUi),
      ...createSystemLayers(),
    ];
    const debugLayers = createDebugLayers('garden', () => useGardenStore.getState().garden);
    if (isDebugEnabled('handles')) {
      debugLayers.push(createAllHandlesLayer({
        getStructures,
        getZones,
        getPlantings,
      }));
    }
    if (isDebugEnabled('clusters')) {
      debugLayers.push(createOptimizerClusterRegionsLayer(
        getStructures,
        () => {
          const u = useUiStore.getState();
          return {
            result: u.optimizerResult,
            selectedCandidate: u.optimizerSelectedCandidate,
            structureId: u.optimizerResultStructureId,
          };
        },
      ));
    }
    // Publish the full set (base + debug) so the sidebar Render Layers panel
    // can list whatever's actually being drawn. Done before wrapping so the
    // registry sees the original alwaysOn/defaultVisible flags.
    setRegisteredLayers('garden', [...baseList, ...debugLayers]);
    const list = [
      ...wrapLayersWithVisibility(baseList, () => useUiStore.getState().renderLayerVisibility),
      ...debugLayers,
    ];
    const map: Record<string, { layer: RenderLayer<unknown> } | GridSlotConfig> = {};
    const gridConfig: GridSlotConfig = {
      spacing: gridCellSizeFt,
      bounds: () => {
        const g = useGardenStore.getState().garden;
        return { x: 0, y: 0, width: g.widthFt, height: g.lengthFt };
      },
      style: {
        line: { paint: { fill: 'solid', color: 'rgba(0,0,0,0.18)' }, width: 1 },
      },
    };
    map.grid = gridConfig;
    list.forEach((l) => { map[l.id] = { layer: l }; });
    return map;
  }, [gridCellSizeFt]);

  // Build the kit camera-coord `View` from local screen-space (zoom, panX, panY).
  // Pre-fit (zoom===0) we render with a fallback margin-fit so the very first
  // paint isn't blank; once the fit effect above runs (next frame) the real
  // view takes over.
  const view = useMemo<View>(() => {
    if (width === 0 || height === 0) return { x: 0, y: 0, scale: 1 };
    if (zoom > 0) {
      return { x: -panX / zoom, y: -panY / zoom, scale: zoom };
    }
    const margin = 40;
    const sx = (width - margin * 2) / Math.max(1, garden.widthFt);
    const sy = (height - margin * 2) / Math.max(1, garden.lengthFt);
    const scale = Math.min(sx, sy);
    const usedW = garden.widthFt * scale;
    const usedH = garden.lengthFt * scale;
    const offX = (width - usedW) / 2;
    const offY = (height - usedH) / 2;
    return { x: -offX / scale, y: -offY / scale, scale };
  }, [width, height, garden.widthFt, garden.lengthFt, zoom, panX, panY]);

  const handleViewChange = (next: View) => {
    const clamped = clampZoom(next.scale);
    setZoomState(clamped);
    setPanXState(-next.x * clamped);
    setPanYState(-next.y * clamped);
  };

  // --- Tools ---
  const selectTool = useEricSelectTool(adapter, { insertAdapter });
  // Second select variant: in 'select-area' viewMode, drags on object bodies
  // are reinterpreted as marquee strokes (no move/resize/clone).
  const selectAreaTool = useEricSelectTool(adapter, {
    insertAdapter,
    forceMarquee: true,
    toolId: 'eric-select-area',
  });
  const cycleTool = useEricCycleTool(adapter, insertAdapter);
  const leftDragPan = useEricLeftDragPanTool();
  const rightDragPan = useEricRightDragPan();
  const wheelZoom = useEricWheelZoomTool();
  const clickZoom = useEricClickZoomTool();
  // Plot (rectangle) drag — migrated onto the putative-drag framework.
  // An `InsertBehavior` mirrors the in-flight start/current points into
  // `uiStore.dragPreview` on every frame so the framework's `dragPreviewLayer`
  // can render the rectangle via `plotDrag.renderPreview`. The kit's internal
  // screen-space `insert-overlay` marquee is suppressed (fully transparent
  // overlayStyle) so the framework owns the visual. Commit still flows
  // through `useInsert.end` → `dispatchApplyBatch` → `insertAdapter.applyBatch`,
  // which calls `gardenStore.checkpoint()` exactly once per gesture.
  // See `src/canvas/drag/plotDrag.ts` for the rationale.
  const insertTool = useInsertTool(insertAdapter, {
    onGestureEnd: () => {
      useUiStore.getState().setPlottingTool(null);
      // Clear the slot — the gesture (committed or cancelled) is over.
      const ui = useUiStore.getState();
      if (ui.dragPreview && ui.dragPreview.kind === PLOT_DRAG_KIND) {
        ui.setDragPreview(null);
      }
    },
    overlayStyle: { fill: 'transparent', stroke: 'transparent', dash: [], lineWidth: 0 },
    behaviors: [
      {
        onStart: (ctx) => {
          const tool = useUiStore.getState().plottingTool;
          if (!tool) return;
          const start = ctx.origin.get('gesture') as { x: number; y: number } | undefined;
          if (!start) return;
          const putative: PlotPutative = {
            start: { x: start.x, y: start.y },
            current: { x: start.x, y: start.y },
            entityKind: tool.category === 'structures' ? 'structure' : 'zone',
            color: tool.color,
          };
          useUiStore.getState().setDragPreview({ kind: PLOT_DRAG_KIND, putative });
        },
        onMove: (_ctx, proposed) => {
          const tool = useUiStore.getState().plottingTool;
          if (!tool) return;
          const putative: PlotPutative = {
            start: { x: proposed.start.x, y: proposed.start.y },
            current: { x: proposed.current.x, y: proposed.current.y },
            entityKind: tool.category === 'structures' ? 'structure' : 'zone',
            color: tool.color,
          };
          useUiStore.getState().setDragPreview({ kind: PLOT_DRAG_KIND, putative });
        },
      },
    ],
  });
  // Palette → garden drop tool (non-claiming pseudo-tool). Mirrors the
  // seed-starting `usePaletteDropTool`: subscribes to `palettePointerPayload`,
  // owns ghost + threshold drag + commit. Reads our local `viewRef` to do
  // screen→world math (the canvas owns its viewport state).
  useGardenPaletteDropTool({ containerRef, viewRef });

  const viewMode = useUiStore((s) => s.viewMode);
  const plottingTool = useUiStore((s) => s.plottingTool);
  const activeToolId = useMemo(() => {
    if (plottingTool) return insertTool.id;
    switch (viewMode) {
      case 'pan':
        return leftDragPan.id;
      case 'select':
      case 'draw': // insertTool activates above when plottingTool is set; bare draw = select
        return selectTool.id;
      case 'select-area':
        // Force-marquee variant: drag-from-body draws a marquee instead of moving.
        return selectAreaTool.id;
      case 'zoom':
        // Click-to-zoom around the cursor; shift-click zooms out. Wheel-zoom
        // remains always-on. Double-click on the toolbar zoom button still
        // resets to fit-view (handled in the toolbar, not here).
        return clickZoom.id;
      default:
        return selectTool.id;
    }
  }, [viewMode, plottingTool, leftDragPan.id, selectTool.id, selectAreaTool.id, insertTool.id, clickZoom.id]);

  const tools = useTools({
    active: activeToolId,
    registry: {
      [selectTool.id]: selectTool,
      [selectAreaTool.id]: selectAreaTool,
      [cycleTool.id]: cycleTool,
      [leftDragPan.id]: leftDragPan,
      [insertTool.id]: insertTool,
      [clickZoom.id]: clickZoom,
    },
    alwaysOn: [rightDragPan, wheelZoom],
  });

  return (
    <div
      ref={containerRef}
      data-canvas-container
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: garden.groundColor,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {width > 0 && height > 0 && (
        <Canvas<SceneNode, ScenePose>
          width={width}
          height={height}
          adapter={adapter}
          view={view}
          onViewChange={handleViewChange}
          layers={layers}
          tools={tools}
          selectionMode="none"
        />
      )}
    </div>
  );
}
