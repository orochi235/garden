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
import { createSystemLayer } from './layers/systemLayersWorld';
import type { GetUi, View } from './layers/worldLayerData';
import { useEricSelectTool } from './tools/useEricSelectTool';
import { useEricCycleTool } from './tools/useEricCycleTool';
import { useEricRightDragPan } from './tools/useEricRightDragPan';
import { useEricLeftDragPanTool } from './tools/useEricLeftDragPanTool';
import { useGardenPaletteDropTool } from './tools/useGardenPaletteDropTool';
import { SeedStartingCanvasNewPrototype } from './SeedStartingCanvasNewPrototype';
import { wrapLayersWithVisibility } from './layers/visibilityWrap';
import { createDebugLayers } from './layers/debugLayers';
import { setRegisteredLayers } from './layers/renderLayerRegistry';
import { createOptimizerGhostLayer } from './layers/optimizerGhostLayer';

export function CanvasNewPrototype() {
  const appMode = useUiStore((s) => s.appMode);
  if (appMode === 'seed-starting') return <SeedStartingCanvasNewPrototype />;
  return <GardenCanvasNewPrototype />;
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
  // Pulse → re-render layers while flashes are active.
  useHighlightTick();

  const [, setIconTick] = useState(0);
  useEffect(() => onIconLoad(() => setIconTick((t) => t + 1)), []);

  const adapter = useMemo(() => createGardenSceneAdapter(), []);
  const insertAdapter = useMemo(() => createInsertAdapter(), []);

  const didFitRef = useRef(false);
  useEffect(() => {
    if (didFitRef.current) return;
    if (width === 0 || height === 0) return;
    didFitRef.current = true;
    const fit = computeFitView(width, height, garden.widthFt, garden.heightFt);
    useUiStore.getState().setZoom(fit.zoom);
    useUiStore.getState().setPan(fit.panX, fit.panY);
  }, [width, height, garden.widthFt, garden.heightFt]);

  const gridCellSizeFt = useGardenStore((s) => s.garden.gridCellSizeFt);

  const layers = useMemo(() => {
    const getStructures = () => useGardenStore.getState().garden.structures;
    const getZones = () => useGardenStore.getState().garden.zones;
    const getPlantings = () => useGardenStore.getState().garden.plantings;
    const getUi: GetUi = () => {
      const u = useUiStore.getState();
      // Per-id flash opacity — layers call `getOpacity(id)` per entity. The
      // highlight store already keys flashes/hovers by id; we just pass the
      // reader through so each layer can pulse independently.
      const getOpacity = (id: string) => useHighlightStore.getState().computeOpacity(id);
      return {
        selectedIds: u.selectedIds,
        labelMode: u.labelMode,
        labelFontSize: u.labelFontSize,
        plantIconScale: u.plantIconScale,
        showFootprintCircles: u.showFootprintCircles,
        getOpacity,
        debugOverlappingLabels: u.debugOverlappingLabels,
        dragClashIds: u.dragClashIds,
      };
    };

    const baseList: RenderLayer<unknown>[] = [
      ...createZoneLayers(getZones, getUi),
      ...createStructureLayers(getStructures, getUi),
      ...createPlantingLayers(getPlantings, getZones, getStructures, getUi),
      createOptimizerGhostLayer(
        getStructures,
        () => {
          const u = useUiStore.getState();
          return { result: u.optimizerResult, selectedCandidate: u.optimizerSelectedCandidate };
        },
      ),
      createGroupOutlineLayer(getStructures, getUi),
      createSelectionOutlineLayer(getPlantings, getZones, getStructures, getUi),
      createSelectionHandlesLayer(getZones, getStructures, getUi),
      createSystemLayer(),
    ];
    const debugLayers = createDebugLayers('garden', () => useGardenStore.getState().garden);
    if (isDebugEnabled('handles')) {
      debugLayers.push(createAllHandlesLayer({
        getStructures,
        getZones,
        getPlantings,
      }));
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
        return { x: 0, y: 0, width: g.widthFt, height: g.heightFt };
      },
      style: {
        line: { paint: { fill: 'solid', color: 'rgba(0,0,0,0.18)' }, width: 1 },
      },
    };
    map.grid = gridConfig;
    list.forEach((l) => { map[l.id] = { layer: l }; });
    return map;
  }, [gridCellSizeFt]);

  // Reset-view (Cmd+0) and zoom-keys (Cmd+= / Cmd+-) live in eric's existing
  // resetViewAction + actions registry; they write to useUiStore.zoom/pan.
  // We mirror those into our local View on render so the prototype reflects
  // them. View also gets updated by tools (wheel-zoom, right-drag-pan, move
  // delta) via setView → setUi.setZoom/setPan.
  const zoom = useUiStore((s) => s.zoom);
  const panX = useUiStore((s) => s.panX);
  const panY = useUiStore((s) => s.panY);

  const view = useMemo<View>(() => {
    if (width === 0 || height === 0) return { x: 0, y: 0, scale: 1 };
    if (zoom > 0) {
      // useUiStore stores screen-space pan (pixels). Convert to camera-position View.
      return { x: -panX / zoom, y: -panY / zoom, scale: zoom };
    }
    const margin = 40;
    const sx = (width - margin * 2) / Math.max(1, garden.widthFt);
    const sy = (height - margin * 2) / Math.max(1, garden.heightFt);
    const scale = Math.min(sx, sy);
    const usedW = garden.widthFt * scale;
    const usedH = garden.heightFt * scale;
    const offX = (width - usedW) / 2;
    const offY = (height - usedH) / 2;
    return { x: -offX / scale, y: -offY / scale, scale };
  }, [width, height, garden.widthFt, garden.heightFt, zoom, panX, panY]);

  const handleViewChange = (next: View) => {
    const ui = useUiStore.getState();
    ui.setZoom(next.scale);
    ui.setPan(-next.x * next.scale, -next.y * next.scale);
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
  const insertTool = useInsertTool(insertAdapter, {
    onGestureEnd: () => useUiStore.getState().setPlottingTool(null),
  });
  // Palette → garden drop tool (non-claiming pseudo-tool). Mirrors the
  // seed-starting `usePaletteDropTool`: subscribes to `palettePointerPayload`,
  // owns ghost + threshold drag + commit. Reads `useUiStore.zoom`/`panX`/`panY`
  // directly because garden mode keeps those as the source of truth (full
  // view-ownership migration deferred — see docs/TODO.md).
  useGardenPaletteDropTool({ containerRef });

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
