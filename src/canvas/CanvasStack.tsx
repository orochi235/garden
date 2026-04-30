import { useCallback, useEffect, useRef, useState } from 'react';
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
import { screenToWorld } from '@/canvas-kit';
import { handleCursor, hitTestAllLayers, hitTestCascade, hitTestHandles, hitTestObjects, hitTestPlantings } from './hitTest';
import { hitTestCell } from './seedStartingHitTest';
import { getSeedlingWarnings } from '../model/seedlingWarnings';
import { resolveGroupMoves } from '../model/seedlingMoveResolver';
import { useAutoCenter } from './hooks/useAutoCenter';
import { useKeyboardActionDispatch } from '../actions/useKeyboardActionDispatch';
import { cycleLayer } from '../actions/layers/cycleLayer';
import { useClipboard } from './hooks/useClipboard';
import { useLayerEffect } from '@/canvas-kit';
import { useMoveInteraction } from './hooks/useMoveInteraction';
import { usePanInteraction } from './hooks/usePanInteraction';
import { useAreaSelectInteraction } from './hooks/useAreaSelectInteraction';
import { usePlotInteraction } from './hooks/usePlotInteraction';
import { useResizeInteraction } from './hooks/useResizeInteraction';
import { onIconLoad, renderPlant } from './plantRenderers';
import { getCultivar } from '../model/cultivars';
import { createDragGhost } from '@/canvas-kit';
import { PlantingLayerRenderer } from './PlantingLayerRenderer';
import { renderBlueprint } from './renderBlueprint';
import { renderGrid } from '@/canvas-kit';
import { SystemLayerRenderer } from './SystemLayerRenderer';
import { StructureLayerRenderer } from './StructureLayerRenderer';
import { TrayLayerRenderer } from './TrayLayerRenderer';
import { SeedlingLayerRenderer } from './SeedlingLayerRenderer';
import { useCanvasSize } from '@/canvas-kit';
import { computeWheelAction } from './wheelHandler';
import { getActiveViewport } from './viewport';
import { ZoneLayerRenderer } from './ZoneLayerRenderer';
import { getTrayViewport, getTrayViewportForSize } from './hooks/useTrayViewport';
import { fitZoom } from '@/canvas-kit';

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
  useAutoCenter(width, height, garden.widthFt, garden.heightFt, setPan);
  const clipboard = useClipboard();
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
  const pan = usePanInteraction();
  const moveInteraction = useMoveInteraction(containerRef, invalidate);
  const resize = useResizeInteraction(containerRef);
  const areaSelect = useAreaSelectInteraction({ containerRef, selectionCanvasRef, width, height, dpr });
  const plot = usePlotInteraction({ containerRef, selectionCanvasRef, width, height, dpr });

  useKeyboardActionDispatch({ clipboard });

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        plot.cancel();
        areaSelect.cancel();
        moveInteraction.cancel();
        setActiveCursor(null);
      }
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [plot, areaSelect, moveInteraction]);

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

  useLayerEffect(
    structureCanvasRef, width, height, dpr,
    appMode === 'garden' && layerVisibility.structures,
    (ctx) => structureRenderer.current.render(ctx),
    [appMode, garden.structures, zoom, panX, panY, layerOpacity.structures, activeLayer, renderLayerVisibility, renderLayerOrder, debugOverlappingLabels, labelMode, labelFontSize, structureRenderer.current.highlight, overlay],
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
      garden.zones, zoom, panX, panY, layerOpacity.zones, activeLayer, labelMode, labelFontSize, zoneRenderer.current.highlight, overlay, renderLayerVisibility, renderLayerOrder,
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
    (ctx) => systemRenderer.current.render(ctx),
    [appMode, selectedIds, garden.structures, garden.zones, garden.plantings, zoom, panX, panY],
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
          plot.start(worldX, worldY, e.altKey);
          setActiveCursor('crosshair');
          return;
        }

        if (currentViewMode === 'select-area') {
          areaSelect.start(worldX, worldY, e.shiftKey);
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
          const obj =
            handleHit.layer === 'structures'
              ? garden.structures.find((s) => s.id === handleHit.id)
              : garden.zones.find((z) => z.id === handleHit.id);
          if (obj) {
            resize.start(handleHit.handle, handleHit.id, handleHit.layer, obj, worldX, worldY);
            setActiveCursor(handleCursor(handleHit.handle));
          }
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
            // Clone the object and drag the clone
            if (hit.layer === 'plantings') {
              const planting = garden.plantings.find((p) => p.id === hit.id);
              if (planting) {
                const parent = garden.structures.find((s) => s.id === planting.parentId)
                  ?? garden.zones.find((z) => z.id === planting.parentId);
                if (parent) {
                  // Defer clone creation until drag threshold is exceeded
                  select(hit.id);
                  moveInteraction.start(worldX, worldY, hit.id, hit.layer, parent.x + planting.x, parent.y + planting.y, false, {
                    parentId: planting.parentId,
                    x: planting.x,
                    y: planting.y,
                    cultivarId: planting.cultivarId,
                    parentWorldX: parent.x,
                    parentWorldY: parent.y,
                  });
                  setActiveCursor('copy');
                }
              }
            } else {
              const obj =
                hit.layer === 'structures'
                  ? garden.structures.find((s) => s.id === hit.id)
                  : garden.zones.find((z) => z.id === hit.id);
              if (obj) {
                const { addStructure, addZone } = useGardenStore.getState();
                if (hit.layer === 'structures') {
                  addStructure({ type: (obj as typeof garden.structures[0]).type, x: obj.x, y: obj.y, width: obj.width, height: obj.height });
                  const newStructures = useGardenStore.getState().garden.structures;
                  const clone = newStructures[newStructures.length - 1];
                  select(clone.id);
                  moveInteraction.start(worldX, worldY, clone.id, hit.layer, clone.x, clone.y, true);
                } else {
                  addZone({ x: obj.x, y: obj.y, width: obj.width, height: obj.height });
                  const newZones = useGardenStore.getState().garden.zones;
                  const clone = newZones[newZones.length - 1];
                  select(clone.id);
                  moveInteraction.start(worldX, worldY, clone.id, hit.layer, clone.x, clone.y, true);
                }
                setActiveCursor('copy');
              }
            }
          } else if (e.shiftKey) {
            addToSelection(hit.id);
          } else {
            select(hit.id);
          }
          if (!e.altKey) {
            let obj: { x: number; y: number } | undefined;
            if (hit.layer === 'plantings') {
              const planting = garden.plantings.find((p) => p.id === hit.id);
              if (planting) {
                const parent = garden.structures.find((s) => s.id === planting.parentId)
                  ?? garden.zones.find((z) => z.id === planting.parentId);
                if (parent) {
                  obj = { x: parent.x + planting.x, y: parent.y + planting.y };
                }
              }
            } else {
              obj = hit.layer === 'structures'
                ? garden.structures.find((s) => s.id === hit.id)
                : garden.zones.find((z) => z.id === hit.id);
            }
            if (obj) {
              moveInteraction.start(worldX, worldY, hit.id, hit.layer, obj.x, obj.y);
              setActiveCursor('move');
            }
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
    [select, addToSelection, clearSelection, pan, moveInteraction, resize, plot, areaSelect],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (resize.move(e)) return;
      if (areaSelect.move(e)) return;
      if (plot.move(e)) return;
      if (moveInteraction.move(e)) return;
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
    [resize, areaSelect, plot, moveInteraction, pan],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0) {
        if (areaSelect.isDragging.current) {
          areaSelect.end();
          setActiveCursor(null);
          return;
        }
        if (plot.isPlotting.current) {
          plot.end();
          setActiveCursor(null);
          return;
        }
        pan.end();
        resize.end();
        moveInteraction.end(e);
        setActiveCursor(null);
      }
      if (e.button === 2) {
        pan.end();
        setActiveCursor(null);
      }
    },
    [areaSelect, plot, resize, moveInteraction, pan],
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
        useUiStore.getState().viewMode,
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
