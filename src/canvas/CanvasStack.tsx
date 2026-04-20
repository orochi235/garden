import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayerSelector } from '../components/LayerSelector';
import { ReturnToGarden } from '../components/ReturnToGarden';
import { ScaleIndicator } from '../components/ScaleIndicator';
import type { PaletteEntry } from '../components/palette/paletteData';
import { ViewToolbar } from '../components/ViewToolbar';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { screenToWorld, snapToGrid, worldToScreen } from '../utils/grid';
import { handleCursor, hitTestAllLayers, hitTestHandles, hitTestObjects } from './hitTest';
import { useAutoCenter } from './hooks/useAutoCenter';
import { useCanvasKeyboard } from './hooks/useCanvasKeyboard';
import { useClipboard } from './hooks/useClipboard';
import { useLayerEffect } from './hooks/useLayerEffect';
import { useMoveInteraction } from './hooks/useMoveInteraction';
import { usePanInteraction } from './hooks/usePanInteraction';
import { usePlotInteraction } from './hooks/usePlotInteraction';
import { useResizeInteraction } from './hooks/useResizeInteraction';
import { renderBlueprint } from './renderBlueprint';
import { renderGrid } from './renderGrid';
import { renderPlantings } from './renderPlantings';
import { renderSelection } from './renderSelection';
import { renderStructures } from './renderStructures';
import { renderZones } from './renderZones';
import { useCanvasSize } from './useCanvasSize';
import { computeWheelAction } from './wheelHandler';

interface CanvasStackProps {
  draggingEntry: PaletteEntry | null;
  onDragEnd: () => void;
}

export function CanvasStack({ draggingEntry, onDragEnd }: CanvasStackProps) {
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
  const showSurfaces = useUiStore((s) => s.showSurfaces);
  const viewMode = useUiStore((s) => s.viewMode);

  const [activeCursor, setActiveCursor] = useState<string | null>(null);
  const [dragGhost, setDragGhost] = useState<{
    entry: PaletteEntry;
    screenX: number;
    screenY: number;
  } | null>(null);

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
  useLayerEffect(
    gridCanvasRef,
    width,
    height,
    dpr,
    true,
    (ctx) =>
      renderGrid(ctx, {
        widthFt: garden.widthFt,
        heightFt: garden.heightFt,
        cellSizeFt: garden.gridCellSizeFt,
        view,
        canvasWidth: width,
        canvasHeight: height,
      }),
    [garden.widthFt, garden.heightFt, garden.gridCellSizeFt, zoom, panX, panY],
  );

  useLayerEffect(
    blueprintCanvasRef,
    width,
    height,
    dpr,
    layerVisibility.blueprint,
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

  useLayerEffect(
    structureCanvasRef,
    width,
    height,
    dpr,
    layerVisibility.structures,
    (ctx) =>
      renderStructures(
        ctx,
        garden.structures,
        view,
        width,
        height,
        layerOpacity.structures,
        layerSelectorHovered && activeLayer === 'structures',
        showSurfaces,
      ),
    [garden.structures, zoom, panX, panY, layerOpacity.structures, activeLayer, layerSelectorHovered, showSurfaces],
  );

  useLayerEffect(
    zoneCanvasRef,
    width,
    height,
    dpr,
    layerVisibility.zones,
    (ctx) =>
      renderZones(
        ctx,
        garden.zones,
        view,
        width,
        height,
        layerOpacity.zones,
        layerSelectorHovered && activeLayer === 'zones',
      ),
    [garden.zones, zoom, panX, panY, layerOpacity.zones, activeLayer, layerSelectorHovered],
  );

  useLayerEffect(
    plantingCanvasRef,
    width,
    height,
    dpr,
    layerVisibility.plantings,
    (ctx) =>
      renderPlantings(
        ctx,
        garden.plantings,
        garden.zones,
        view,
        width,
        height,
        layerOpacity.plantings,
        layerSelectorHovered && activeLayer === 'plantings',
      ),
    [garden.plantings, garden.zones, zoom, panX, panY, layerOpacity.plantings, activeLayer, layerSelectorHovered],
  );

  useLayerEffect(
    selectionCanvasRef,
    width,
    height,
    dpr,
    true,
    (ctx) =>
      renderSelection(ctx, selectedIds, garden.structures, garden.zones, view, width, height),
    [selectedIds, garden.structures, garden.zones, zoom, panX, panY],
  );

  // --- Event dispatch ---
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
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

        // Object hit test — try active layer first, then fall back to all layers
        let hit = hitTestObjects(
          worldX,
          worldY,
          garden.structures,
          garden.zones,
          currentActiveLayer,
        );
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
            const obj =
              hit.layer === 'structures'
                ? garden.structures.find((s) => s.id === hit.id)
                : garden.zones.find((z) => z.id === hit.id);
            if (obj) {
              const { addStructure, addZone } = useGardenStore.getState();
              if (hit.layer === 'structures') {
                addStructure({ type: (obj as typeof garden.structures[0]).type, x: obj.x, y: obj.y, width: obj.width, height: obj.height });
                // The new structure is the last one added
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
          } else if (e.shiftKey) {
            addToSelection(hit.id);
          } else {
            select(hit.id);
          }
          if (!e.altKey) {
            const obj =
              hit.layer === 'structures'
                ? garden.structures.find((s) => s.id === hit.id)
                : garden.zones.find((z) => z.id === hit.id);
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
    [select, addToSelection, clearSelection, pan, moveInteraction, resize, plot],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (resize.move(e)) return;
      if (plot.move(e)) return;
      if (moveInteraction.move(e)) return;
      if (pan.move(e)) return;

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
        const hit =
          hitTestObjects(worldX, worldY, garden.structures, garden.zones, currentActiveLayer) ||
          hitTestAllLayers(worldX, worldY, garden.structures, garden.zones);
        setActiveCursor(hit ? 'pointer' : null);
      }
    },
    [resize, plot, moveInteraction, pan],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0) {
        if (plot.isPlotting.current) {
          plot.end();
          setActiveCursor(null);
          return;
        }
        pan.end();
        resize.end();
        moveInteraction.end();
        setActiveCursor(null);
      }
      if (e.button === 2) {
        pan.end();
        setActiveCursor(null);
      }
    },
    [plot, resize, moveInteraction, pan],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('application/garden-object')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        if (draggingEntry) {
          setDragGhost({
            entry: draggingEntry,
            screenX: e.clientX - rect.left,
            screenY: e.clientY - rect.top,
          });
        }
      }
    },
    [draggingEntry],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear when actually leaving the container, not entering a child
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragGhost(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragGhost(null);
      onDragEnd();
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
        addStructure({
          type: entry.type,
          x: snappedX,
          y: snappedY,
          width: entry.defaultWidth,
          height: entry.defaultHeight,
        });
      } else if (entry.category === 'zones') {
        addZone({
          x: snappedX,
          y: snappedY,
          width: entry.defaultWidth,
          height: entry.defaultHeight,
        });
      } else if (entry.category === 'plantings') {
        const zone = garden.zones.find(
          (z) =>
            worldX >= z.x && worldX <= z.x + z.width && worldY >= z.y && worldY <= z.y + z.height,
        );
        if (zone) {
          addPlanting({
            zoneId: zone.id,
            x: snapToGrid(worldX - zone.x, cellSize),
            y: snapToGrid(worldY - zone.y, cellSize),
            name: entry.name,
          });
        }
      }
    },
    [onDragEnd],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const currentState = useUiStore.getState();
      const result = computeWheelAction(
        currentState.viewMode,
        { zoom: currentState.zoom, panX: currentState.panX, panY: currentState.panY },
        {
          deltaX: e.deltaX,
          deltaY: e.deltaY,
          mouseX: e.clientX - rect.left,
          mouseY: e.clientY - rect.top,
          ctrlKey: e.ctrlKey || e.metaKey,
        },
      );

      setZoom(result.zoom);
      setPan(result.panX, result.panY);
    },
    [setZoom, setPan],
  );

  const ghostStyle = useMemo(() => {
    if (!dragGhost) return null;
    const { entry, screenX, screenY } = dragGhost;
    if (entry.defaultWidth === 0 || entry.defaultHeight === 0) return null;
    const { panX, panY, zoom } = useUiStore.getState();
    const cellSize = useGardenStore.getState().garden.gridCellSizeFt;
    const [worldX, worldY] = screenToWorld(screenX, screenY, { panX, panY, zoom });
    const snappedX = snapToGrid(worldX - entry.defaultWidth / 2, cellSize);
    const snappedY = snapToGrid(worldY - entry.defaultHeight / 2, cellSize);
    const [sx, sy] = worldToScreen(snappedX, snappedY, { panX, panY, zoom });
    return {
      position: 'absolute' as const,
      left: sx,
      top: sy,
      width: entry.defaultWidth * zoom,
      height: entry.defaultHeight * zoom,
      backgroundColor: entry.color,
      opacity: 0.4,
      border: '2px dashed rgba(255,255,255,0.6)',
      borderRadius: 2,
      pointerEvents: 'none' as const,
      zIndex: 10,
    };
  }, [dragGhost]);

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
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: groundColor,
        cursor:
          activeCursor ??
          (viewMode === 'draw'
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
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <canvas ref={gridCanvasRef} style={{ ...canvasStyle, mixBlendMode: 'multiply' }} />
      <canvas ref={blueprintCanvasRef} style={canvasStyle} />
      <canvas ref={structureCanvasRef} style={canvasStyle} />
      <canvas ref={zoneCanvasRef} style={canvasStyle} />
      <canvas ref={plantingCanvasRef} style={canvasStyle} />
      <canvas ref={selectionCanvasRef} style={canvasStyle} />
      {ghostStyle && <div style={ghostStyle} />}
      <ReturnToGarden canvasWidth={width} canvasHeight={height} />
      <ScaleIndicator canvasHeight={height} />
      <ViewToolbar />
      <LayerSelector />
    </div>
  );
}
