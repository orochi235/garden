import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayerSelector } from '../components/LayerSelector';
import { ReturnToGarden } from '../components/ReturnToGarden';
import { SeedWarningsToggle } from '../components/SeedWarningsToggle';
import { FloatingTraySwitcher } from '../components/FloatingTraySwitcher';
import { ModeOnly } from '../components/ModeOnly';
import { ScaleIndicator } from '../components/ScaleIndicator';
import { ViewToolbar } from '../components/ViewToolbar';
import type { Planting, Structure, Zone } from '../model/types';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { screenToWorld } from '@orochi235/weasel';
import { handleCursor, hitTestAllLayers, hitTestCascade, hitTestHandles, hitTestObjects, hitTestPlantings } from './hitTest';
import { hitTestCell, hitTestDragSpreadAffordance } from './seedStartingHitTest';
import { getSeedlingWarnings } from '../model/seedlingWarnings';
import { resolveGroupMoves } from '../model/seedlingMoveResolver';
import { useAutoCenter } from '@orochi235/weasel';
import { useKeyboardActionDispatch } from '../actions/useKeyboardActionDispatch';
import { cycleLayer } from '../actions/layers/cycleLayer';
import { useClipboard } from '@orochi235/weasel/clipboard';
import { useLayerEffect } from '@orochi235/weasel';
import { useCloneInteraction, cloneByAltDrag } from '@orochi235/weasel/clone';
import {
  useMoveInteraction as useKitMoveInteraction,
  useResizeInteraction as useKitResizeInteraction,
  useInsertInteraction as useKitInsertInteraction,
} from '@orochi235/weasel';
import { snapToGrid, snapToContainer, snapBackOrDelete } from '@orochi235/weasel/move';
import { snapToGrid as resizeSnapToGrid, clampMinSize } from '@orochi235/weasel/resize';
import { snapToGrid as insertSnapToGrid } from '@orochi235/weasel/insert';
import { createPlantingMoveAdapter } from './adapters/plantingMove';
import { createZoneMoveAdapter } from './adapters/zoneMove';
import { createStructureMoveAdapter } from './adapters/structureMove';
import { createZoneResizeAdapter } from './adapters/zoneResize';
import { createStructureResizeAdapter } from './adapters/structureResize';
import { createInsertAdapter } from './adapters/insert';
import { usePanInteraction } from '@orochi235/weasel';
import { useAreaSelectInteraction, selectFromMarquee } from '@orochi235/weasel/area-select';
import { createAreaSelectAdapter } from './adapters/areaSelect';
import type { HandlePosition } from './hitTest';
import type { ResizeAnchor } from '@orochi235/weasel';
import { onIconLoad, renderPlant } from './plantRenderers';
import { getCultivar } from '../model/cultivars';
import { createDragGhost } from '@orochi235/weasel';
import { PlantingLayerRenderer } from './PlantingLayerRenderer';
import { renderBlueprint } from './renderBlueprint';
import { renderGrid } from '@orochi235/weasel';
import { SystemLayerRenderer } from './SystemLayerRenderer';
import { StructureLayerRenderer } from './StructureLayerRenderer';
import { TrayLayerRenderer } from './TrayLayerRenderer';
import { SeedlingLayerRenderer } from './SeedlingLayerRenderer';
import { useCanvasSize } from '@orochi235/weasel';
import { computeWheelAction } from '@orochi235/weasel';
import { getActivePan, getActiveViewport } from './viewport';
import { ZoneLayerRenderer } from './ZoneLayerRenderer';
import { getTrayViewport, getTrayViewportForSize } from './hooks/useTrayViewport';
import { fitZoom } from '@orochi235/weasel';

function handlePositionToAnchor(h: HandlePosition): ResizeAnchor {
  // 'min' = the edge AT origin x/y; 'max' = the opposite edge; 'free' = axis not dragged.
  // Dragging east edge ('e') means west is anchor → x.min anchors.
  const x: ResizeAnchor['x'] =
    h === 'e' || h === 'ne' || h === 'se' ? 'min'
    : h === 'w' || h === 'nw' || h === 'sw' ? 'max'
    : 'free';
  const y: ResizeAnchor['y'] =
    h === 's' || h === 'se' || h === 'sw' ? 'min'
    : h === 'n' || h === 'ne' || h === 'nw' ? 'max'
    : 'free';
  return { x, y };
}

export function CanvasStack() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const blueprintCanvasRef = useRef<HTMLCanvasElement>(null);
  const structureCanvasRef = useRef<HTMLCanvasElement>(null);
  const zoneCanvasRef = useRef<HTMLCanvasElement>(null);
  const plantingCanvasRef = useRef<HTMLCanvasElement>(null);
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, dpr } = useCanvasSize(containerRef);

  const garden = useGardenStore((s) => s.garden);
  const groundColor = garden.groundColor;
  const zoom = useUiStore((s) => s.zoom);
  const panX = useUiStore((s) => s.panX);
  const panY = useUiStore((s) => s.panY);
  const setZoom = useUiStore((s) => s.setZoom);
  const setPan = useUiStore((s) => s.setPan);
  const layerVisibility = useUiStore((s) => s.layerVisibility);
  const layerOpacity = useUiStore((s) => s.layerOpacity);
  const selectedIds = useUiStore((s) => s.selectedIds);
  const select = useUiStore((s) => s.select);
  const addToSelection = useUiStore((s) => s.addToSelection);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const activeLayer = useUiStore((s) => s.activeLayer);
  const layerSelectorHovered = useUiStore((s) => s.layerSelectorHovered);
  const renderLayerVisibility = useUiStore((s) => s.renderLayerVisibility);
  const renderLayerOrder = useUiStore((s) => s.renderLayerOrder);
  const debugOverlappingLabels = useUiStore((s) => s.debugOverlappingLabels);
  const labelMode = useUiStore((s) => s.labelMode);
  const labelFontSize = useUiStore((s) => s.labelFontSize);
  const plantIconScale = useUiStore((s) => s.plantIconScale);
  const viewMode = useUiStore((s) => s.viewMode);
  const overlay = useUiStore((s) => s.dragOverlay);
  const resizeOverlayUi = useUiStore((s) => s.resizeOverlay);
  const insertOverlayUi = useUiStore((s) => s.insertOverlay);
  const areaSelectOverlayUi = useUiStore((s) => s.areaSelectOverlay);
  const appMode = useUiStore((s) => s.appMode);
  const currentTrayId = useUiStore((s) => s.currentTrayId);
  const seedStartingZoom = useUiStore((s) => s.seedStartingZoom);
  // Subscribe to pan values so the component re-renders when they change;
  // the actual values are read via getTrayViewportForSize during render.
  void useUiStore((s) => s.seedStartingPanX);
  void useUiStore((s) => s.seedStartingPanY);
  const showSeedlingLabels = useUiStore((s) => s.renderLayerVisibility['seedling-labels'] ?? false);
  const showSeedlingWarnings = useUiStore((s) => s.showSeedlingWarnings);
  const showTrayGrid = useUiStore((s) => s.renderLayerVisibility['tray-grid'] ?? true);
  const seedFillPreview = useUiStore((s) => s.seedFillPreview);
  const seedMovePreview = useUiStore((s) => s.seedMovePreview);
  const hiddenSeedlingIds = useUiStore((s) => s.hiddenSeedlingIds);
  const seedDragCultivarId = useUiStore((s) => s.seedDragCultivarId);

  // --- Layer renderers (persistent instances with internal animation state) ---
  const structureRenderer = useRef<StructureLayerRenderer>(null!);
  const zoneRenderer = useRef<ZoneLayerRenderer>(null!);
  const plantingRenderer = useRef<PlantingLayerRenderer>(null!);
  if (!structureRenderer.current) structureRenderer.current = new StructureLayerRenderer();
  if (!zoneRenderer.current) zoneRenderer.current = new ZoneLayerRenderer();
  if (!plantingRenderer.current) plantingRenderer.current = new PlantingLayerRenderer();
  const systemRenderer = useRef<SystemLayerRenderer>(null!);
  if (!systemRenderer.current) systemRenderer.current = new SystemLayerRenderer();
  const trayRenderer = useRef<TrayLayerRenderer>(null!);
  if (!trayRenderer.current) trayRenderer.current = new TrayLayerRenderer();
  const seedlingRenderer = useRef<SeedlingLayerRenderer>(null!);
  if (!seedlingRenderer.current) seedlingRenderer.current = new SeedlingLayerRenderer();

  const [, forceRender] = useState(0);
  const invalidate = useCallback(() => forceRender((n) => n + 1), []);

  const [seedlingTooltip, setSeedlingTooltip] = useState<
    { x: number; y: number; message: string } | null
  >(null);

  const autoFittedTrayRef = useRef<string | null>(null);

  // Re-render planting layer when async icon images finish loading
  const [iconTick, setIconTick] = useState(0);
  useEffect(() => onIconLoad(() => setIconTick((t) => t + 1)), []);

  useEffect(() => {
    structureRenderer.current.onInvalidate(invalidate);
    zoneRenderer.current.onInvalidate(invalidate);
    plantingRenderer.current.onInvalidate(invalidate);
    systemRenderer.current.onInvalidate(invalidate);
    return () => {
      structureRenderer.current.dispose();
      zoneRenderer.current.dispose();
      plantingRenderer.current.dispose();
      systemRenderer.current.dispose();
    };
  }, [invalidate]);

  // Flash the active layer's renderer only when explicitly requested
  const layerFlashCounter = useUiStore((s) => s.layerFlashCounter);
  const prevFlashRef = useRef(layerFlashCounter);
  useEffect(() => {
    if (layerFlashCounter !== prevFlashRef.current) {
      prevFlashRef.current = layerFlashCounter;
      const renderer =
        activeLayer === 'structures' ? structureRenderer.current :
        activeLayer === 'zones' ? zoneRenderer.current :
        activeLayer === 'plantings' ? plantingRenderer.current : null;
      renderer?.flash();
    }
  }, [layerFlashCounter, activeLayer]);

  // Sync hover highlight to all renderers
  useEffect(() => {
    structureRenderer.current.setHoverHighlight(layerSelectorHovered && activeLayer === 'structures');
    zoneRenderer.current.setHoverHighlight(layerSelectorHovered && activeLayer === 'zones');
    plantingRenderer.current.setHoverHighlight(layerSelectorHovered && activeLayer === 'plantings');
  }, [layerSelectorHovered, activeLayer]);

  const [activeCursor, setActiveCursor] = useState<string | null>(null);

  const view = { panX, panY, zoom };

  // --- Interaction hooks ---
  useAutoCenter(width, height, garden.widthFt, garden.heightFt, setZoom, setPan);
  const setSeedStartingPan = useUiStore((s) => s.setSeedStartingPan);
  const setSeedStartingZoom = useUiStore((s) => s.setSeedStartingZoom);

  // Auto-fit the active tray when entering seed-starting mode or switching trays.
  useEffect(() => {
    if (appMode !== 'seed-starting') {
      autoFittedTrayRef.current = null;
      return;
    }
    const tray = garden.seedStarting.trays.find((t) => t.id === currentTrayId);
    if (!tray || width === 0 || height === 0) return;
    if (autoFittedTrayRef.current === tray.id) return;
    autoFittedTrayRef.current = tray.id;
    const z = fitZoom(
      Math.max(1, width - 80),
      Math.max(1, height - 80),
      tray.widthIn,
      tray.heightIn,
      { min: 5, max: 100 },
    );
    setSeedStartingZoom(z);
    setSeedStartingPan(0, 0);
  }, [appMode, currentTrayId, width, height, garden.seedStarting.trays, setSeedStartingZoom, setSeedStartingPan]);
  const pan = usePanInteraction(getActivePan);

  // --- Kit move interactions (per-adapter) ---
  const plantingMoveAdapter = useMemo(() => createPlantingMoveAdapter(), []);
  const zoneMoveAdapter = useMemo(() => createZoneMoveAdapter(), []);
  const structureMoveAdapter = useMemo(() => createStructureMoveAdapter(), []);

  const plantingMove = useKitMoveInteraction(plantingMoveAdapter, {
    translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
    behaviors: [
      snapToGrid({ cell: garden.gridCellSizeFt, bypassKey: 'alt' }),
      snapToContainer({
        dwellMs: 500,
        findTarget: plantingMoveAdapter.findSnapTarget!,
        isInstant: (t) => (t.metadata as { instant?: boolean } | undefined)?.instant === true,
      }),
      snapBackOrDelete({ radius: garden.gridCellSizeFt, onFreeRelease: 'delete' }),
    ],
  });

  const zoneMove = useKitMoveInteraction(zoneMoveAdapter, {
    translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
    behaviors: [snapToGrid({ cell: garden.gridCellSizeFt, bypassKey: 'alt' })],
  });

  const structureMove = useKitMoveInteraction(structureMoveAdapter, {
    translatePose: (p, dx, dy) => ({ ...p, x: p.x + dx, y: p.y + dy }),
    behaviors: [snapToGrid({ cell: garden.gridCellSizeFt, bypassKey: 'alt' })],
  });

  const zoneResizeAdapter = useMemo(() => createZoneResizeAdapter(), []);
  const structureResizeAdapter = useMemo(() => createStructureResizeAdapter(), []);
  const insertAdapter = useMemo(() => createInsertAdapter(), []);

  const clone = useCloneInteraction(insertAdapter, {
    behaviors: [cloneByAltDrag()],
    setOverlay: (layer, objects) => {
      useUiStore.getState().setDragOverlay({
        layer,
        objects: objects as (import('../model/types').Planting | import('../model/types').Structure | import('../model/types').Zone)[],
        hideIds: [],
        snapped: false,
      });
    },
    clearOverlay: () => useUiStore.getState().clearDragOverlay(),
  });

  const zoneResize = useKitResizeInteraction(zoneResizeAdapter, {
    behaviors: [
      resizeSnapToGrid({ cell: garden.gridCellSizeFt, bypassKey: 'alt' }),
      clampMinSize({ minWidth: 0.25, minHeight: 0.25 }),
    ],
  });
  const structureResize = useKitResizeInteraction(structureResizeAdapter, {
    behaviors: [
      resizeSnapToGrid({ cell: garden.gridCellSizeFt, bypassKey: 'alt' }),
      clampMinSize({ minWidth: 0.25, minHeight: 0.25 }),
    ],
  });
  const insert = useKitInsertInteraction(insertAdapter, {
    behaviors: [insertSnapToGrid({ cell: garden.gridCellSizeFt, bypassKey: 'alt' })],
    minBounds: { width: 0.01, height: 0.01 },
  });

  const clipboard = useClipboard(insertAdapter, {
    getSelection: () => useUiStore.getState().selectedIds,
    pasteLabel: 'Paste',
  });

  const areaSelectAdapter = useMemo(() => createAreaSelectAdapter(), []);
  const areaSelect = useAreaSelectInteraction(areaSelectAdapter, {
    behaviors: [selectFromMarquee()],
  });

  // --- Mirror kit overlay into useUiStore.dragOverlay ---
  useEffect(() => {
    const ov = plantingMove.overlay ?? zoneMove.overlay ?? structureMove.overlay;
    if (!ov) {
      useUiStore.getState().clearDragOverlay();
      return;
    }
    const layer: 'plantings' | 'zones' | 'structures' = plantingMove.overlay
      ? 'plantings'
      : zoneMove.overlay
        ? 'zones'
        : 'structures';
    const objects = ov.draggedIds.map((id) => {
      const pose = ov.poses.get(id)!;
      if (layer === 'plantings') {
        const p = useGardenStore.getState().garden.plantings.find((x) => x.id === id)!;
        // The kit getPose already returns world coords; overlay poses are world coords too.
        // The renderer expects plantings with world x/y in the overlay (same as old hook).
        const tp = pose as { x: number; y: number };
        return { ...p, x: tp.x, y: tp.y };
      }
      if (layer === 'zones') {
        const z = useGardenStore.getState().garden.zones.find((x) => x.id === id)!;
        const tp = pose as { x: number; y: number };
        return { ...z, x: tp.x, y: tp.y };
      }
      const s = useGardenStore.getState().garden.structures.find((x) => x.id === id)!;
      const tp = pose as { x: number; y: number };
      return { ...s, x: tp.x, y: tp.y };
    });
    useUiStore.getState().setDragOverlay({
      layer,
      objects: objects as (import('../model/types').Planting | import('../model/types').Structure | import('../model/types').Zone)[],
      hideIds: ov.hideIds,
      snapped: ov.snapped !== null,
    });
  }, [plantingMove.overlay, zoneMove.overlay, structureMove.overlay]);

  // --- Mirror kit resize overlay into useUiStore.resizeOverlay ---
  useEffect(() => {
    const ov = structureResize.overlay ?? zoneResize.overlay;
    if (!ov) {
      useUiStore.getState().setResizeOverlay(null);
      return;
    }
    const layer: 'structures' | 'zones' = structureResize.overlay ? 'structures' : 'zones';
    useUiStore.getState().setResizeOverlay({
      id: ov.id,
      layer,
      currentPose: ov.currentPose,
      targetPose: ov.targetPose,
    });
  }, [structureResize.overlay, zoneResize.overlay]);

  // --- Mirror kit insert overlay into useUiStore.insertOverlay ---
  useEffect(() => {
    const ov = insert.overlay;
    useUiStore.getState().setInsertOverlay(ov ? { start: ov.start, current: ov.current } : null);
  }, [insert.overlay]);

  // --- Mirror kit areaSelect overlay into useUiStore.areaSelectOverlay ---
  useEffect(() => {
    const ov = areaSelect.overlay;
    useUiStore.getState().setAreaSelectOverlay(ov);
  }, [areaSelect.overlay]);

  useKeyboardActionDispatch({ clipboard });

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        insert.cancel();
        structureResize.cancel();
        zoneResize.cancel();
        areaSelect.cancel();
        clone.cancel();
        plantingMove.cancel();
        zoneMove.cancel();
        structureMove.cancel();
        setActiveCursor(null);
      }
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [insert, structureResize, zoneResize, areaSelect, clone, plantingMove, zoneMove, structureMove]);

  // --- Layer rendering ---
  useLayerEffect(
    gridCanvasRef,
    width,
    height,
    dpr,
    appMode === 'garden',
    (ctx) =>
      renderGrid(ctx, {
        widthFt: garden.widthFt,
        heightFt: garden.heightFt,
        cellSizeFt: garden.gridCellSizeFt,
        view,
        canvasWidth: width,
        canvasHeight: height,
      }),
    [appMode, garden.widthFt, garden.heightFt, garden.gridCellSizeFt, zoom, panX, panY],
  );

  useLayerEffect(
    blueprintCanvasRef,
    width,
    height,
    dpr,
    appMode === 'garden' && layerVisibility.blueprint,
    (ctx) => renderBlueprint(ctx, garden.blueprint, view, width, height, layerOpacity.blueprint),
    [appMode, garden.blueprint, zoom, panX, panY, layerOpacity.blueprint],
  );

  useEffect(() => {
    function handleBlueprintLoaded() {
      const canvas = blueprintCanvasRef.current;
      if (!canvas || width === 0) return;
      const ctx = canvas.getContext('2d')!;
      if (layerVisibility.blueprint) {
        renderBlueprint(ctx, garden.blueprint, view, width, height, layerOpacity.blueprint);
      }
    }
    window.addEventListener('blueprint-loaded', handleBlueprintLoaded);
    return () => window.removeEventListener('blueprint-loaded', handleBlueprintLoaded);
  }, [
    garden.blueprint,
    zoom,
    panX,
    panY,
    width,
    height,
    layerVisibility.blueprint,
    layerOpacity.blueprint,
  ]);

  // Sync renderer state
  structureRenderer.current.setParams({
    structures: garden.structures,
    opacity: layerOpacity.structures,
    renderLayerVisibility,
    renderLayerOrder: renderLayerOrder['structures'],
    debugOverlappingLabels,
    labelMode: labelMode === 'active-layer' && activeLayer !== 'structures' ? 'none' : labelMode,
    labelFontSize,
  });
  structureRenderer.current.setView(view, width, height);

  zoneRenderer.current.setParams({
    zones: garden.zones,
    opacity: layerOpacity.zones,
    renderLayerVisibility,
    renderLayerOrder: renderLayerOrder['zones'],
    labelMode: labelMode === 'active-layer' && activeLayer !== 'zones' ? 'none' : labelMode,
    labelFontSize,
  });
  zoneRenderer.current.setView(view, width, height);

  plantingRenderer.current.setParams({
    plantings: garden.plantings,
    zones: garden.zones,
    structures: garden.structures,
    opacity: layerOpacity.plantings,
    selectedIds,
    renderLayerVisibility,
    renderLayerOrder: renderLayerOrder['plantings'],
    labelMode: labelMode === 'active-layer' && activeLayer !== 'plantings' ? 'none' : labelMode,
    labelFontSize,
    plantIconScale,
  });
  plantingRenderer.current.setView(view, width, height);

  systemRenderer.current.setParams({
    selectedIds,
    structures: garden.structures,
    zones: garden.zones,
    plantings: garden.plantings,
    renderLayerVisibility,
    renderLayerOrder: renderLayerOrder['system'],
  });
  systemRenderer.current.setView(view, width, height);

  // --- Seed-starting renderers ---
  const currentTray =
    appMode === 'seed-starting'
      ? garden.seedStarting.trays.find((t) => t.id === currentTrayId) ?? null
      : null;
  const seedVp = getTrayViewportForSize(width, height, currentTray);
  const seedOriginX = seedVp?.originX ?? 0;
  const seedOriginY = seedVp?.originY ?? 0;
  const dragSpreadAffordanceHover =
    currentTray && seedFillPreview && seedFillPreview.trayId === currentTray.id
      ? seedFillPreview.scope === 'all'
        ? { kind: 'all' as const }
        : seedFillPreview.scope === 'row'
          ? { kind: 'row' as const, row: seedFillPreview.index }
          : seedFillPreview.scope === 'col'
            ? { kind: 'col' as const, col: seedFillPreview.index }
            : null
      : null;

  trayRenderer.current.setParams({
    tray: currentTray,
    pxPerInch: seedStartingZoom,
    originX: seedOriginX,
    originY: seedOriginY,
    showGrid: showTrayGrid,
    showDragSpreadAffordances: seedDragCultivarId != null,
    dragSpreadAffordanceHover,
  });
  trayRenderer.current.setView(view, width, height);

  seedlingRenderer.current.setParams({
    tray: currentTray,
    seedlings: garden.seedStarting.seedlings,
    pxPerInch: seedStartingZoom,
    originX: seedOriginX,
    originY: seedOriginY,
    showLabel: showSeedlingLabels,
    showWarnings: showSeedlingWarnings,
    selectedIds,
    fillPreview: seedFillPreview,
    movePreview: seedMovePreview,
    hiddenSeedlingIds,
  });
  seedlingRenderer.current.setView(view, width, height);

  plantingRenderer.current.hideIds = overlay?.layer === 'plantings' ? overlay.hideIds : [];
  structureRenderer.current.hideIds = overlay?.layer === 'structures' ? overlay.hideIds : [];
  zoneRenderer.current.hideIds = overlay?.layer === 'zones' ? overlay.hideIds : [];

  if (overlay?.layer === 'plantings') {
    plantingRenderer.current.overlayPlantings = overlay.objects as Planting[];
    plantingRenderer.current.overlaySnapped = overlay.snapped;
  } else {
    plantingRenderer.current.overlayPlantings = [];
    plantingRenderer.current.overlaySnapped = false;
  }
  if (overlay?.layer === 'structures') {
    structureRenderer.current.overlayStructures = overlay.objects as Structure[];
    structureRenderer.current.overlaySnapped = overlay.snapped;
  } else {
    structureRenderer.current.overlayStructures = [];
    structureRenderer.current.overlaySnapped = false;
  }
  if (overlay?.layer === 'zones') {
    zoneRenderer.current.overlayZones = overlay.objects as Zone[];
    zoneRenderer.current.overlaySnapped = overlay.snapped;
  } else {
    zoneRenderer.current.overlayZones = [];
    zoneRenderer.current.overlaySnapped = false;
  }

  // Resize overlay: hide source object, draw at currentPose. Layered after the
  // dragOverlay block so resize-specific overrides apply when active.
  if (resizeOverlayUi) {
    const id = resizeOverlayUi.id;
    const cp = resizeOverlayUi.currentPose;
    if (resizeOverlayUi.layer === 'structures') {
      const src = garden.structures.find((s) => s.id === id);
      if (src) {
        structureRenderer.current.hideIds = [id];
        structureRenderer.current.overlayStructures = [
          { ...src, x: cp.x, y: cp.y, width: cp.width, height: cp.height },
        ];
        structureRenderer.current.overlaySnapped = false;
      }
    } else {
      const src = garden.zones.find((z) => z.id === id);
      if (src) {
        zoneRenderer.current.hideIds = [id];
        zoneRenderer.current.overlayZones = [
          { ...src, x: cp.x, y: cp.y, width: cp.width, height: cp.height },
        ];
        zoneRenderer.current.overlaySnapped = false;
      }
    }
  }

  useLayerEffect(
    structureCanvasRef, width, height, dpr,
    appMode === 'garden' && layerVisibility.structures,
    (ctx) => structureRenderer.current.render(ctx),
    [appMode, garden.structures, zoom, panX, panY, layerOpacity.structures, activeLayer, renderLayerVisibility, renderLayerOrder, debugOverlappingLabels, labelMode, labelFontSize, structureRenderer.current.highlight, overlay, resizeOverlayUi],
  );

  const trayParams = trayRenderer.current;
  const seedlingParams = seedlingRenderer.current;

  useLayerEffect(
    zoneCanvasRef, width, height, dpr,
    appMode === 'garden' ? layerVisibility.zones : appMode === 'seed-starting',
    (ctx) => {
      if (appMode === 'seed-starting') {
        trayRenderer.current.render(ctx);
        return;
      }
      zoneRenderer.current.render(ctx);
    },
    [
      appMode,
      // garden zones
      garden.zones, zoom, panX, panY, layerOpacity.zones, activeLayer, labelMode, labelFontSize, zoneRenderer.current.highlight, overlay, resizeOverlayUi, renderLayerVisibility, renderLayerOrder,
      // seed-starting tray params (capture full param set as one object)
      trayParams.tray, trayParams.pxPerInch, trayParams.originX, trayParams.originY,
      trayParams.showGrid, trayParams.showDragSpreadAffordances, trayParams.dragSpreadAffordanceHover,
    ],
  );

  useLayerEffect(
    plantingCanvasRef, width, height, dpr,
    appMode === 'garden' ? layerVisibility.plantings : appMode === 'seed-starting',
    (ctx) => {
      if (appMode === 'seed-starting') {
        seedlingRenderer.current.render(ctx);
        return;
      }
      plantingRenderer.current.render(ctx);
    },
    [
      appMode,
      // garden plantings
      garden.plantings, garden.zones, garden.structures, zoom, panX, panY, layerOpacity.plantings, activeLayer, selectedIds, renderLayerVisibility, renderLayerOrder, labelMode, labelFontSize, plantIconScale, plantingRenderer.current.highlight, overlay, iconTick,
      // seed-starting seedling params
      seedlingParams.tray, seedlingParams.seedlings, seedlingParams.pxPerInch, seedlingParams.originX, seedlingParams.originY,
      seedlingParams.showLabel, seedlingParams.showWarnings,
      seedlingParams.fillPreview, seedlingParams.movePreview, seedlingParams.hiddenSeedlingIds,
    ],
  );

  useLayerEffect(
    selectionCanvasRef,
    width, height, dpr,
    appMode === 'garden',
    (ctx) => {
      systemRenderer.current.render(ctx);
      const insertOv = useUiStore.getState().insertOverlay;
      const tool = useUiStore.getState().plottingTool;
      if (insertOv && tool) {
        const x = Math.min(insertOv.start.x, insertOv.current.x);
        const y = Math.min(insertOv.start.y, insertOv.current.y);
        const w = Math.abs(insertOv.current.x - insertOv.start.x);
        const h = Math.abs(insertOv.current.y - insertOv.start.y);
        const sx = panX + x * zoom;
        const sy = panY + y * zoom;
        const sw = w * zoom;
        const sh = h * zoom;
        const color = tool.color ?? '#8B6914';
        ctx.fillStyle = `${color}66`;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.setLineDash([]);
      }
      const areaOv = useUiStore.getState().areaSelectOverlay;
      if (areaOv) {
        const x = Math.min(areaOv.start.worldX, areaOv.current.worldX);
        const y = Math.min(areaOv.start.worldY, areaOv.current.worldY);
        const w = Math.abs(areaOv.current.worldX - areaOv.start.worldX);
        const h = Math.abs(areaOv.current.worldY - areaOv.start.worldY);
        const sx = panX + x * zoom;
        const sy = panY + y * zoom;
        const sw = w * zoom;
        const sh = h * zoom;
        ctx.fillStyle = 'rgba(91, 164, 207, 0.15)';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = '#5BA4CF';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.setLineDash([]);
      }
    },
    [appMode, selectedIds, garden.structures, garden.zones, garden.plantings, zoom, panX, panY, insertOverlayUi, areaSelectOverlayUi],
  );

  // --- Seedling drag (in-tray move; multi-select moves group; drag-out removes) ---
  const beginSeedlingDrag = useCallback((e: React.MouseEvent): boolean => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const vp = getTrayViewport(rect);
    if (!vp) return false;
    const { tray, pxPerInch, originX, originY } = vp;
    const { garden: g } = useGardenStore.getState();
    const ui = useUiStore.getState();
    const sx0 = e.clientX - rect.left;
    const sy0 = e.clientY - rect.top;
    const cell = hitTestCell(tray, { pxPerInch, originX, originY }, sx0, sy0);
    if (!cell) return false;
    const slot = tray.slots[cell.row * tray.cols + cell.col];
    if (slot.state !== 'sown' || !slot.seedlingId) return false;
    const anchorSeedling = g.seedStarting.seedlings.find((s) => s.id === slot.seedlingId);
    if (!anchorSeedling) return false;
    const anchorCultivar = getCultivar(anchorSeedling.cultivarId);

    // Decide whether this is a single-seedling drag or a group drag.
    // Group drag fires when the grabbed seedling is part of the current selection AND
    // the selection has multiple members; otherwise a single-item drag (which does not
    // disturb the existing selection).
    const isAnchorSelected = ui.selectedIds.includes(anchorSeedling.id);
    const groupIds =
      isAnchorSelected && ui.selectedIds.length > 1 ? ui.selectedIds.slice() : [anchorSeedling.id];
    const groupSeedlings = groupIds
      .map((id) => g.seedStarting.seedlings.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s && s.trayId === tray.id && s.row != null && s.col != null);
    if (groupSeedlings.length === 0) return false;
    const isGroup = groupSeedlings.length > 1;

    const trayId = tray.id;
    const anchorFromRow = anchorSeedling.row!;
    const anchorFromCol = anchorSeedling.col!;
    const cellPx = tray.cellPitchIn * pxPerInch;
    const radius = (cellPx * 0.85) / 2;
    let activated = false;
    let ghost: ReturnType<typeof createDragGhost> | null = null;
    let unsubIcon: (() => void) | null = null;
    const THRESHOLD = 4;

    function ensureGhost() {
      if (ghost) return ghost;
      ghost = createDragGhost({
        sizeCss: Math.max(16, radius * 2),
        paint: (ctx) =>
          renderPlant(ctx, anchorSeedling!.cultivarId, radius, anchorCultivar?.color ?? '#888'),
      });
      unsubIcon = onIconLoad(() => ghost?.repaint());
      return ghost;
    }

    function updatePreview(clientX: number, clientY: number) {
      const r = containerRef.current?.getBoundingClientRect();
      if (!r) return;
      const sx = clientX - r.left;
      const sy = clientY - r.top;
      if (!isGroup) {
        const aff = hitTestDragSpreadAffordance(tray!, { pxPerInch, originX, originY }, sx, sy);
        if (aff) {
          const base = { trayId, cultivarId: anchorSeedling!.cultivarId, replace: true };
          useUiStore.getState().setSeedFillPreview(
            aff.kind === 'all'
              ? { ...base, scope: 'all' }
              : aff.kind === 'row'
                ? { ...base, scope: 'row', index: aff.row }
                : { ...base, scope: 'col', index: aff.col },
          );
          ghost?.setHidden(true);
          return;
        }
      }
      const hit = hitTestCell(tray!, { pxPerInch, originX, originY }, sx, sy);
      if (!hit) {
        useUiStore.getState().setSeedFillPreview(null);
        useUiStore.getState().setSeedMovePreview(null);
        ghost?.setHidden(false);
        return;
      }
      if (isGroup) {
        const dr = hit.row - anchorFromRow;
        const dc = hit.col - anchorFromCol;
        const pending = groupSeedlings.map((s) => ({
          seedlingId: s.id,
          cultivarId: s.cultivarId,
          fromRow: s.row!,
          fromCol: s.col!,
          toRow: s.row! + dr,
          toCol: s.col! + dc,
        }));
        const result = resolveGroupMoves(tray!, pending);
        useUiStore.getState().setSeedMovePreview({
          trayId,
          feasible: result.feasible,
          cells: result.moves.map((m) => ({
            row: m.finalRow,
            col: m.finalCol,
            cultivarId: m.cultivarId,
            bumped: m.bumped,
          })),
        });
        ghost?.setHidden(true);
      } else {
        if (hit.row !== anchorFromRow || hit.col !== anchorFromCol) {
          useUiStore.getState().setSeedFillPreview({
            trayId,
            cultivarId: anchorSeedling!.cultivarId,
            scope: 'cell',
            row: hit.row,
            col: hit.col,
            replace: true,
          });
          ghost?.setHidden(true);
        } else {
          useUiStore.getState().setSeedFillPreview(null);
          ghost?.setHidden(false);
        }
      }
    }

    function onMove(ev: PointerEvent) {
      if (!activated) {
        const dx = ev.clientX - e.clientX;
        const dy = ev.clientY - e.clientY;
        if (dx * dx + dy * dy < THRESHOLD * THRESHOLD) return;
        activated = true;
        ensureGhost();
        // Hide every dragged seedling so the canvas shows movement, not stale copies.
        useUiStore.getState().setHiddenSeedlingIds(groupSeedlings.map((s) => s.id));
        // Light up the row/col/all gutter affordances (single-item drag only).
        if (!isGroup) useUiStore.getState().setSeedDragCultivarId(anchorSeedling!.cultivarId);
      }
      ghost?.move(ev.clientX, ev.clientY);
      updatePreview(ev.clientX, ev.clientY);
    }

    function cleanup() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      unsubIcon?.();
      ghost?.destroy();
      useUiStore.getState().setSeedFillPreview(null);
      useUiStore.getState().setSeedMovePreview(null);
      useUiStore.getState().setHiddenSeedlingIds([]);
      useUiStore.getState().setSeedDragCultivarId(null);
    }

    function onUp(ev: PointerEvent) {
      cleanup();
      if (!activated) {
        // Click without drag → select / toggle / replace selection
        const ui2 = useUiStore.getState();
        if (ev.shiftKey || ev.metaKey) {
          if (ui2.selectedIds.includes(anchorSeedling!.id)) {
            ui2.setSelection(ui2.selectedIds.filter((id) => id !== anchorSeedling!.id));
          } else {
            ui2.addToSelection(anchorSeedling!.id);
          }
        } else {
          ui2.select(anchorSeedling!.id);
        }
        return;
      }
      const r = containerRef.current?.getBoundingClientRect();
      if (!r) return;
      const sx = ev.clientX - r.left;
      const sy = ev.clientY - r.top;
      const hit = hitTestCell(tray!, { pxPerInch, originX, originY }, sx, sy);
      if (isGroup) {
        if (!hit) return; // dropping a group outside the tray is a no-op
        const dr = hit.row - anchorFromRow;
        const dc = hit.col - anchorFromCol;
        if (dr === 0 && dc === 0) return;
        const pending = groupSeedlings.map((s) => ({
          seedlingId: s.id,
          cultivarId: s.cultivarId,
          fromRow: s.row!,
          fromCol: s.col!,
          toRow: s.row! + dr,
          toCol: s.col! + dc,
        }));
        const result = resolveGroupMoves(tray!, pending);
        if (!result.feasible) return;
        useGardenStore.getState().moveSeedlingGroup(
          trayId,
          result.moves.map((m) => ({
            seedlingId: m.seedlingId,
            toRow: m.finalRow,
            toCol: m.finalCol,
          })),
        );
        return;
      }
      const aff = hitTestDragSpreadAffordance(tray!, { pxPerInch, originX, originY }, sx, sy);
      if (aff) {
        // Spread the cultivar across the row/col/all; remove the source seedling.
        const gs = useGardenStore.getState();
        gs.clearCell(trayId, anchorFromRow, anchorFromCol);
        if (aff.kind === 'all') gs.fillTray(trayId, anchorSeedling!.cultivarId, { replace: true });
        else if (aff.kind === 'row') gs.fillRow(trayId, aff.row, anchorSeedling!.cultivarId, { replace: true });
        else gs.fillColumn(trayId, aff.col, anchorSeedling!.cultivarId, { replace: true });
        return;
      }
      if (!hit) {
        useGardenStore.getState().clearCell(trayId, anchorFromRow, anchorFromCol);
        return;
      }
      if (hit.row === anchorFromRow && hit.col === anchorFromCol) return;
      useGardenStore
        .getState()
        .moveSeedling(trayId, anchorFromRow, anchorFromCol, hit.row, hit.col);
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    e.preventDefault();
    return true;
  }, []);

  // --- Event dispatch ---
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const isSeed = useUiStore.getState().appMode === 'seed-starting';
      if (isSeed) {
        if (e.button === 0 && useUiStore.getState().viewMode !== 'pan') {
          if (beginSeedlingDrag(e)) return;
          // Click on empty cell or background → clear selection (unless modifier held)
          if (!e.shiftKey && !e.metaKey) clearSelection();
        }
        // Seed mode: only support pan (left-drag in pan view-mode, or right-button)
        if (e.button === 2 || useUiStore.getState().viewMode === 'pan') {
          pan.start(e);
          setActiveCursor('grabbing');
        }
        return;
      }
      if (e.button === 0) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const { panX, panY, zoom, plottingTool, viewMode: currentViewMode } = useUiStore.getState();
        const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, {
          panX,
          panY,
          zoom,
        });

        if (currentViewMode === 'draw' && plottingTool) {
          insert.start(worldX, worldY, {
            alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey,
          });
          setActiveCursor('crosshair');
          return;
        }

        if (currentViewMode === 'select-area') {
          areaSelect.start(worldX, worldY, {
            alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey,
          });
          setActiveCursor('crosshair');
          return;
        }

        if (currentViewMode === 'pan') {
          pan.start(e);
          setActiveCursor('grabbing');
          return;
        }

        const { garden } = useGardenStore.getState();
        const { activeLayer: currentActiveLayer, selectedIds: currentSelectedIds } =
          useUiStore.getState();

        // Resize handles first
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const handleHit = hitTestHandles(
          screenX,
          screenY,
          currentSelectedIds,
          garden.structures,
          garden.zones,
          { panX, panY, zoom },
        );
        if (handleHit) {
          const anchor = handlePositionToAnchor(handleHit.handle);
          if (handleHit.layer === 'structures') {
            structureResize.start(handleHit.id, anchor, worldX, worldY);
          } else {
            zoneResize.start(handleHit.id, anchor, worldX, worldY);
          }
          setActiveCursor(handleCursor(handleHit.handle));
          return;
        }

        // Object hit test — try plantings first, then active layer, then all layers
        let hit = hitTestPlantings(worldX, worldY, garden.plantings, garden.structures, garden.zones);
        if (hit) {
          useUiStore.getState().setActiveLayer('plantings');
        }
        if (!hit) {
          hit = hitTestObjects(
            worldX,
            worldY,
            garden.structures,
            garden.zones,
            currentActiveLayer,
          );
        }
        if (!hit) {
          const crossHit = hitTestAllLayers(worldX, worldY, garden.structures, garden.zones);
          if (crossHit) {
            useUiStore.getState().setActiveLayer(crossHit.layer);
            hit = crossHit;
          }
        }
        if (hit) {
          if (e.altKey) {
            select(hit.id);
            clone.start(worldX, worldY, [hit.id], hit.layer as 'plantings' | 'structures' | 'zones', {
              alt: true, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey,
            });
            setActiveCursor('copy');
            return;
          } else if (e.shiftKey) {
            addToSelection(hit.id);
          } else {
            select(hit.id);
          }
          if (hit.layer === 'plantings') {
            plantingMove.start({
              ids: [hit.id],
              worldX,
              worldY,
              clientX: e.clientX,
              clientY: e.clientY,
            });
            setActiveCursor('move');
          } else if (hit.layer === 'structures') {
            const primary = garden.structures.find((s) => s.id === hit.id);
            const childIds = primary
              ? garden.structures.filter((s) => s.parentId === primary.id).map((s) => s.id)
              : [];
            structureMove.start({
              ids: [hit.id, ...childIds],
              worldX,
              worldY,
              clientX: e.clientX,
              clientY: e.clientY,
            });
            setActiveCursor('move');
          } else if (hit.layer === 'zones') {
            zoneMove.start({
              ids: [hit.id],
              worldX,
              worldY,
              clientX: e.clientX,
              clientY: e.clientY,
            });
            setActiveCursor('move');
          }
        } else {
          clearSelection();
        }
      }
      if (e.button === 2) {
        pan.start(e);
        setActiveCursor('grabbing');
      }
    },
    [select, addToSelection, clearSelection, pan, clone, plantingMove, zoneMove, structureMove, insert, structureResize, zoneResize, areaSelect],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Dispatch to kit hooks (resize/insert/move). kit move() returns true when active.
      {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const { panX: px, panY: py, zoom: z } = useUiStore.getState();
          const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, { panX: px, panY: py, zoom: z });
          const modifiers = { alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey };

          if (areaSelect.isAreaSelecting && areaSelect.move(worldX, worldY, modifiers)) return;
          if (clone.isCloning && clone.move(worldX, worldY, modifiers)) return;
          if (structureResize.isResizing && structureResize.move(worldX, worldY, modifiers)) return;
          if (zoneResize.isResizing && zoneResize.move(worldX, worldY, modifiers)) return;
          if (insert.isInserting && insert.move(worldX, worldY, modifiers)) return;

          const args = { worldX, worldY, clientX: e.clientX, clientY: e.clientY, modifiers };
          if (plantingMove.move(args)) return;
          if (zoneMove.move(args)) return;
          if (structureMove.move(args)) return;
        }
      }

      if (pan.move(e)) return;

      // Seed-starting: tooltip when hovering a seedling with warnings
      const uiState = useUiStore.getState();
      if (uiState.appMode === 'seed-starting' && uiState.showSeedlingWarnings) {
        const rect = containerRef.current?.getBoundingClientRect();
        const { garden } = useGardenStore.getState();
        const vp = rect ? getTrayViewport(rect) : null;
        if (rect && vp) {
          const { tray, pxPerInch, originX, originY } = vp;
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const cell = hitTestCell(tray, { pxPerInch, originX, originY }, sx, sy);
          let next: { x: number; y: number; message: string } | null = null;
          if (cell) {
            const slot = tray.slots[cell.row * tray.cols + cell.col];
            if (slot.state === 'sown' && slot.seedlingId) {
              const seedling = garden.seedStarting.seedlings.find((s) => s.id === slot.seedlingId);
              if (seedling) {
                const warnings = getSeedlingWarnings(seedling, tray);
                if (warnings.length > 0) {
                  next = { x: sx, y: sy, message: warnings.map((w) => w.message).join(' ') };
                }
              }
            }
          }
          setSeedlingTooltip((prev) => {
            if (!next) return prev ? null : prev;
            if (prev && prev.x === next.x && prev.y === next.y && prev.message === next.message) return prev;
            return next;
          });
        } else {
          setSeedlingTooltip((prev) => (prev ? null : prev));
        }
        return;
      }
      setSeedlingTooltip((prev) => (prev ? null : prev));

      // Hover hit-test for cursor in select mode
      const { viewMode: currentViewMode, activeLayer: currentActiveLayer } = useUiStore.getState();
      if (currentViewMode === 'select') {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const { panX, panY, zoom } = useUiStore.getState();
        const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, {
          panX,
          panY,
          zoom,
        });
        const { garden } = useGardenStore.getState();
        const hit = hitTestCascade(worldX, worldY, garden.plantings, garden.structures, garden.zones, currentActiveLayer);
        setActiveCursor(hit ? 'pointer' : null);
      }
    },
    [structureResize, zoneResize, insert, areaSelect, clone, plantingMove, zoneMove, structureMove, pan],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0) {
        if (areaSelect.isAreaSelecting) {
          areaSelect.end();
          setActiveCursor(null);
          return;
        }
        if (insert.isInserting) {
          insert.end();
          setActiveCursor(null);
          return;
        }
        if (structureResize.isResizing) {
          structureResize.end();
          setActiveCursor(null);
          return;
        }
        if (zoneResize.isResizing) {
          zoneResize.end();
          setActiveCursor(null);
          return;
        }
        if (clone.isCloning) {
          clone.end();
          setActiveCursor(null);
          return;
        }
        pan.end();
        // End kit move hooks (non-clone path)
        plantingMove.end();
        zoneMove.end();
        structureMove.end();
        setActiveCursor(null);
      }
      if (e.button === 2) {
        pan.end();
        setActiveCursor(null);
      }
    },
    [areaSelect, insert, structureResize, zoneResize, clone, plantingMove, zoneMove, structureMove, pan],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      if (useUiStore.getState().appMode === 'seed-starting') {
        const { currentTrayId } = useUiStore.getState();
        const { garden } = useGardenStore.getState();
        const tray = garden.seedStarting.trays.find((t) => t.id === currentTrayId);
        if (!tray) return;
        const padding = 40;
        const availW = rect.width - padding * 2;
        const availH = rect.height - padding * 2;
        const newZoom = Math.min(100, Math.max(5, Math.min(availW / tray.widthIn, availH / tray.heightIn)));
        setSeedStartingZoom(newZoom);
        setSeedStartingPan(0, 0);
        return;
      }

      if (!e.metaKey) return;
      const { panX, panY, zoom } = useUiStore.getState();
      const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, {
        panX,
        panY,
        zoom,
      });
      const { garden } = useGardenStore.getState();

      // Hit-test to find the object under the cursor
      let hit = hitTestCascade(worldX, worldY, garden.plantings, garden.structures, garden.zones, useUiStore.getState().activeLayer);
      if (!hit) return;

      // Get the object's bounding box in world coords
      let objX: number, objY: number, objW: number, objH: number;
      if (hit.layer === 'plantings') {
        const planting = garden.plantings.find((p) => p.id === hit!.id);
        if (!planting) return;
        const parent = garden.structures.find((s) => s.id === planting.parentId)
          ?? garden.zones.find((z) => z.id === planting.parentId);
        if (!parent) return;
        // For plantings, zoom to the parent container
        objX = parent.x;
        objY = parent.y;
        objW = parent.width;
        objH = parent.height;
      } else {
        const obj = hit.layer === 'structures'
          ? garden.structures.find((s) => s.id === hit!.id)
          : garden.zones.find((z) => z.id === hit!.id);
        if (!obj) return;
        objX = obj.x;
        objY = obj.y;
        objW = obj.width;
        objH = obj.height;
      }

      // Calculate zoom to fit the object with padding
      const padding = 80; // screen pixels of padding on each side
      const availW = rect.width - padding * 2;
      const availH = rect.height - padding * 2;
      const newZoom = Math.min(200, Math.max(10, Math.min(availW / objW, availH / objH)));

      // Center the object
      const centerWorldX = objX + objW / 2;
      const centerWorldY = objY + objH / 2;
      const newPanX = rect.width / 2 - centerWorldX * newZoom;
      const newPanY = rect.height / 2 - centerWorldY * newZoom;

      select(hit.id);
      setZoom(newZoom);
      setPan(newPanX, newPanY);
    },
    [select, setZoom, setPan],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Alt+scroll cycles layers (works in both modes; cycleLayer adapts to active mode)
      if (e.altKey) {
        cycleLayer(e.deltaY > 0 ? -1 : 1);
        return;
      }

      const vp = getActiveViewport();
      const result = computeWheelAction(
        { zoom: vp.zoom, panX: vp.panX, panY: vp.panY },
        {
          deltaX: e.deltaX,
          deltaY: e.deltaY,
          mouseX: e.clientX - rect.left,
          mouseY: e.clientY - rect.top,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey,
        },
        vp.bounds,
      );
      vp.setZoom(result.zoom);
      vp.setPan(result.panX, result.panY);
    },
    [],
  );

  const canvasStyle = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none' as const,
  };

  return (
    <div
      ref={containerRef}
      data-canvas-container
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: appMode === 'seed-starting' ? '#d8c8a4' : groundColor,
        cursor:
          activeCursor ??
          (viewMode === 'draw' || viewMode === 'select-area'
            ? 'crosshair'
            : viewMode === 'pan'
              ? 'grab'
              : viewMode === 'zoom'
                ? 'zoom-in'
                : 'default'),
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
    >
      <canvas ref={gridCanvasRef} style={{ ...canvasStyle, mixBlendMode: 'multiply' }} />
      <canvas ref={blueprintCanvasRef} style={canvasStyle} />
      <canvas ref={structureCanvasRef} style={canvasStyle} />
      <canvas ref={zoneCanvasRef} style={canvasStyle} />
      <canvas ref={plantingCanvasRef} style={canvasStyle} />
      <canvas ref={selectionCanvasRef} style={canvasStyle} />
      {seedlingTooltip && (
        <div
          style={{
            position: 'absolute',
            left: seedlingTooltip.x + 12,
            top: seedlingTooltip.y + 12,
            background: 'rgba(40, 32, 18, 0.95)',
            color: '#fff',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 12,
            border: '1px solid #daa520',
            pointerEvents: 'none',
            zIndex: 10,
            maxWidth: 240,
          }}
        >
          {seedlingTooltip.message}
        </div>
      )}
      <ModeOnly mode="seed-starting">
        <SeedWarningsToggle />
        <FloatingTraySwitcher />
      </ModeOnly>
      <ReturnToGarden canvasWidth={width} canvasHeight={height} />
      <ModeOnly mode="garden">
        <ScaleIndicator canvasHeight={height} />
      </ModeOnly>
      <ViewToolbar />
      <ModeOnly mode="garden">
        <LayerSelector />
      </ModeOnly>
    </div>
  );
}
