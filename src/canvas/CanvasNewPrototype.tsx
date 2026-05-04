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
import type { RenderLayer } from '@orochi235/weasel';
import { createInsertAdapter } from './adapters/insert';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { useHighlightStore, useHighlightTick } from '../store/highlightStore';
import { createGardenSceneAdapter, type SceneNode, type ScenePose } from './adapters/gardenScene';
import { createStructureLayers } from './layers/structureLayersWorld';
import { createZoneLayers } from './layers/zoneLayersWorld';
import { createPlantingLayers } from './layers/plantingLayersWorld';
import { createSelectionOutlineLayer, createSelectionHandlesLayer } from './layers/selectionLayersWorld';
import { createSystemLayer } from './layers/systemLayersWorld';
import type { GetUi, View } from './layers/worldLayerData';
import { useEricSelectTool } from './tools/useEricSelectTool';
import { useEricCycleTool } from './tools/useEricCycleTool';
import { useEricRightDragPan } from './tools/useEricRightDragPan';
import { useEricLeftDragPanTool } from './tools/useEricLeftDragPanTool';
import { SeedStartingCanvasNewPrototype } from './SeedStartingCanvasNewPrototype';
import { wrapLayersWithVisibility } from './layers/visibilityWrap';
import { createDebugLayers } from './layers/debugLayers';
import { setRegisteredLayers } from './layers/renderLayerRegistry';

const warnedViewModes = new Set<string>();
function warnUnwiredViewMode(mode: string) {
  if (warnedViewModes.has(mode)) return;
  warnedViewModes.add(mode);
  // eslint-disable-next-line no-console
  console.warn(`[CanvasNewPrototype] viewMode '${mode}' has no dedicated canvas tool yet; falling back to select.`);
}

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
      const sel = u.selectedIds;
      // Aggregate highlight: take the max of per-id flash opacities for
      // anything currently selected (the legacy behavior — flash is used to
      // pulse the selected entity on snap-back / drop). Layers receive a
      // single number; per-id pulsing is a Phase 5 refinement.
      const hs = useHighlightStore.getState();
      let maxOp = 0;
      for (const id of sel) {
        const o = hs.computeOpacity(id);
        if (o > maxOp) maxOp = o;
      }
      return {
        selectedIds: sel,
        labelMode: u.labelMode,
        labelFontSize: u.labelFontSize,
        plantIconScale: u.plantIconScale,
        showFootprintCircles: true,
        highlightOpacity: maxOp,
        debugOverlappingLabels: u.debugOverlappingLabels,
      };
    };

    const baseList: RenderLayer<unknown>[] = [
      ...createZoneLayers(getZones, getUi),
      ...createStructureLayers(getStructures, getUi),
      ...createPlantingLayers(getPlantings, getZones, getStructures, getUi),
      createSelectionOutlineLayer(getPlantings, getZones, getStructures, getUi),
      createSelectionHandlesLayer(getZones, getStructures, getUi),
      createSystemLayer(),
    ];
    const debugLayers = createDebugLayers('garden', () => useGardenStore.getState().garden);
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
  const selectTool = useEricSelectTool(adapter);
  const cycleTool = useEricCycleTool(adapter);
  const leftDragPan = useEricLeftDragPanTool();
  const rightDragPan = useEricRightDragPan();
  const wheelZoom = useEricWheelZoomTool();
  const insertTool = useInsertTool(insertAdapter, {
    onGestureEnd: () => useUiStore.getState().setPlottingTool(null),
  });

  const viewMode = useUiStore((s) => s.viewMode);
  const plottingTool = useUiStore((s) => s.plottingTool);
  const activeToolId = useMemo(() => {
    if (plottingTool) return insertTool.id;
    switch (viewMode) {
      case 'pan':
        return leftDragPan.id;
      case 'select':
      case 'select-area': // marquee is built into selectTool's empty-drag behavior
      case 'draw': // insertTool activates above when plottingTool is set; bare draw = select
        return selectTool.id;
      case 'zoom':
        // No drag-to-zoom-rect tool yet; double-click on the toolbar zoom button
        // triggers fit-view. Wheel-zoom is always-on. Falling back to select keeps
        // click-selection working while in this mode.
        warnUnwiredViewMode(viewMode);
        return selectTool.id;
      default:
        return selectTool.id;
    }
  }, [viewMode, plottingTool, leftDragPan.id, selectTool.id, insertTool.id]);

  const tools = useTools({
    active: activeToolId,
    registry: {
      [selectTool.id]: selectTool,
      [cycleTool.id]: cycleTool,
      [leftDragPan.id]: leftDragPan,
      [insertTool.id]: insertTool,
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
