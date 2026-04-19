import { useRef, useEffect, useCallback, useState } from 'react';
import { useCanvasSize } from './useCanvasSize';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { renderGrid } from './renderGrid';
import { renderBlueprint } from './renderBlueprint';
import { renderStructures } from './renderStructures';
import { renderZones } from './renderZones';
import { renderPlantings } from './renderPlantings';
import { screenToWorld } from '../utils/grid';
import { snapToGrid } from '../utils/grid';
import type { PaletteEntry } from '../components/palette/paletteData';
import { hitTestObjects, hitTestAllLayers, hitTestHandles, handleCursor } from './hitTest';
import { renderSelection } from './renderSelection';
import { LayerSelector } from '../components/LayerSelector';
import { ViewToolbar } from '../components/ViewToolbar';
import { computeWheelAction } from './wheelHandler';
import { useAutoCenter } from './hooks/useAutoCenter';
import { useClipboard } from './hooks/useClipboard';
import { useCanvasKeyboard } from './hooks/useCanvasKeyboard';
import { usePanInteraction } from './hooks/usePanInteraction';
import { useMoveInteraction } from './hooks/useMoveInteraction';
import { useResizeInteraction } from './hooks/useResizeInteraction';
import { usePlotInteraction } from './hooks/usePlotInteraction';
import { useLayerEffect } from './hooks/useLayerEffect';

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
  const plottingTool = useUiStore((s) => s.plottingTool);
  const activeLayer = useUiStore((s) => s.activeLayer);
  const viewMode = useUiStore((s) => s.viewMode);

  const [activeCursor, setActiveCursor] = useState<string | null>(null);

  const view = { panX, panY, zoom };

  // --- Interaction hooks ---
  useAutoCenter(width, height, garden.widthFt, garden.heightFt, setPan);
  const clipboard = useClipboard();
  const pan = usePanInteraction(setPan);
  const moveInteraction = useMoveInteraction(containerRef);
  const resize = useResizeInteraction(containerRef);
  const plot = usePlotInteraction({ containerRef, selectionCanvasRef, width, height, dpr });

  const cancelPlotting = useCallback(() => {
    plot.cancel();
  }, [plot]);

  useCanvasKeyboard({ clipboard, cancelPlotting });

  // --- Layer rendering ---
  useLayerEffect(gridCanvasRef, width, height, dpr, true,
    (ctx) => renderGrid(ctx, { widthFt: garden.widthFt, heightFt: garden.heightFt, cellSizeFt: garden.gridCellSizeFt, view, canvasWidth: width, canvasHeight: height }),
    [garden.widthFt, garden.heightFt, garden.gridCellSizeFt, zoom, panX, panY],
  );

  useLayerEffect(blueprintCanvasRef, width, height, dpr, layerVisibility.blueprint,
    (ctx) => renderBlueprint(ctx, garden.blueprint, view, width, height, layerOpacity.blueprint),
    [garden.blueprint, zoom, panX, panY, layerOpacity.blueprint],
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
  }, [garden.blueprint, zoom, panX, panY, width, height, layerVisibility.blueprint, layerOpacity.blueprint]);

  useLayerEffect(structureCanvasRef, width, height, dpr, layerVisibility.structures,
    (ctx) => renderStructures(ctx, garden.structures, view, width, height, layerOpacity.structures, activeLayer === 'structures'),
    [garden.structures, zoom, panX, panY, layerOpacity.structures, activeLayer],
  );

  useLayerEffect(zoneCanvasRef, width, height, dpr, layerVisibility.zones,
    (ctx) => renderZones(ctx, garden.zones, view, width, height, layerOpacity.zones, activeLayer === 'zones'),
    [garden.zones, zoom, panX, panY, layerOpacity.zones, activeLayer],
  );

  useLayerEffect(plantingCanvasRef, width, height, dpr, layerVisibility.plantings,
    (ctx) => renderPlantings(ctx, garden.plantings, garden.zones, view, width, height, layerOpacity.plantings, activeLayer === 'plantings'),
    [garden.plantings, garden.zones, zoom, panX, panY, layerOpacity.plantings, activeLayer],
  );

  useLayerEffect(selectionCanvasRef, width, height, dpr, true,
    (ctx) => renderSelection(ctx, selectedIds, garden.structures, garden.zones, view, width, height),
    [selectedIds, garden.structures, garden.zones, zoom, panX, panY],
  );

  // --- Event dispatch ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { panX, panY, zoom, plottingTool } = useUiStore.getState();
      const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, { panX, panY, zoom });

      if (plottingTool) {
        plot.start(worldX, worldY, e.altKey);
        setActiveCursor('crosshair');
        return;
      }

      const { garden } = useGardenStore.getState();
      const { activeLayer: currentActiveLayer, selectedIds: currentSelectedIds } = useUiStore.getState();

      // Resize handles first
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const handleHit = hitTestHandles(screenX, screenY, currentSelectedIds, garden.structures, garden.zones, { panX, panY, zoom });
      if (handleHit) {
        const obj = handleHit.layer === 'structures'
          ? garden.structures.find((s) => s.id === handleHit.id)
          : garden.zones.find((z) => z.id === handleHit.id);
        if (obj) {
          resize.start(handleHit.handle, handleHit.id, handleHit.layer, obj, worldX, worldY);
          setActiveCursor(handleCursor(handleHit.handle));
        }
        return;
      }

      // Object hit test — try active layer first, then fall back to all layers
      let hit = hitTestObjects(worldX, worldY, garden.structures, garden.zones, currentActiveLayer);
      if (!hit) {
        const crossHit = hitTestAllLayers(worldX, worldY, garden.structures, garden.zones);
        if (crossHit) {
          useUiStore.getState().setActiveLayer(crossHit.layer);
          hit = crossHit;
        }
      }
      if (hit) {
        if (e.shiftKey) {
          addToSelection(hit.id);
        } else {
          select(hit.id);
        }
        const obj = hit.layer === 'structures'
          ? garden.structures.find((s) => s.id === hit.id)
          : garden.zones.find((z) => z.id === hit.id);
        if (obj) {
          moveInteraction.start(worldX, worldY, hit.id, hit.layer, obj.x, obj.y);
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
  }, [select, addToSelection, clearSelection, pan, moveInteraction, resize, plot]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (resize.move(e)) return;
    if (plot.move(e)) return;
    if (moveInteraction.move(e)) return;
    pan.move(e);
  }, [resize, plot, moveInteraction, pan]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      if (plot.isPlotting.current) {
        plot.end();
        setActiveCursor(null);
        return;
      }
      resize.end();
      moveInteraction.end();
      setActiveCursor(null);
    }
    if (e.button === 2) {
      pan.end();
      setActiveCursor(null);
    }
  }, [plot, resize, moveInteraction, pan]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/garden-object')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/garden-object');
    if (!raw) return;

    let entry: PaletteEntry;
    try {
      entry = JSON.parse(raw) as PaletteEntry;
    } catch {
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const { panX, panY, zoom } = useUiStore.getState();
    const view = { panX, panY, zoom };
    const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, view);

    const { garden, addStructure, addZone, addPlanting } = useGardenStore.getState();
    const cellSize = garden.gridCellSizeFt;

    const snappedX = snapToGrid(worldX - entry.defaultWidth / 2, cellSize);
    const snappedY = snapToGrid(worldY - entry.defaultHeight / 2, cellSize);

    if (entry.category === 'structures') {
      addStructure({ type: entry.type, x: snappedX, y: snappedY, width: entry.defaultWidth, height: entry.defaultHeight });
    } else if (entry.category === 'zones') {
      addZone({ x: snappedX, y: snappedY, width: entry.defaultWidth, height: entry.defaultHeight });
    } else if (entry.category === 'plantings') {
      const zone = garden.zones.find(
        (z) => worldX >= z.x && worldX <= z.x + z.width && worldY >= z.y && worldY <= z.y + z.height,
      );
      if (zone) {
        addPlanting({ zoneId: zone.id, x: snapToGrid(worldX - zone.x, cellSize), y: snapToGrid(worldY - zone.y, cellSize), name: entry.name });
      }
    }
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const currentState = useUiStore.getState();
    const result = computeWheelAction(
      currentState.viewMode,
      { zoom: currentState.zoom, panX: currentState.panX, panY: currentState.panY },
      { deltaX: e.deltaX, deltaY: e.deltaY, mouseX: e.clientX - rect.left, mouseY: e.clientY - rect.top },
    );

    setZoom(result.zoom);
    setPan(result.panX, result.panY);
  }, [setZoom, setPan]);

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
      style={{ width: '100%', height: '100%', position: 'relative', background: groundColor, cursor: activeCursor ?? (plottingTool ? 'crosshair' : viewMode === 'pan' ? 'grab' : viewMode === 'zoom' ? 'zoom-in' : 'default') }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <canvas ref={gridCanvasRef} style={canvasStyle} />
      <canvas ref={blueprintCanvasRef} style={canvasStyle} />
      <canvas ref={structureCanvasRef} style={canvasStyle} />
      <canvas ref={zoneCanvasRef} style={canvasStyle} />
      <canvas ref={plantingCanvasRef} style={canvasStyle} />
      <canvas ref={selectionCanvasRef} style={canvasStyle} />
      <ViewToolbar />
      <LayerSelector />
    </div>
  );
}
