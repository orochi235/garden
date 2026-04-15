import { useRef, useEffect, useCallback } from 'react';
import { useCanvasSize } from './useCanvasSize';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { renderGrid } from './renderGrid';
import { renderStructures } from './renderStructures';
import { renderZones } from './renderZones';
import { renderPlantings } from './renderPlantings';
import { screenToWorld, snapToGrid } from '../utils/grid';
import type { PaletteEntry } from '../components/palette/paletteData';
import { hitTestObjects } from './hitTest';

export function CanvasStack() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const structureCanvasRef = useRef<HTMLCanvasElement>(null);
  const zoneCanvasRef = useRef<HTMLCanvasElement>(null);
  const plantingCanvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, dpr } = useCanvasSize(containerRef);

  const garden = useGardenStore((s) => s.garden);
  const zoom = useUiStore((s) => s.zoom);
  const panX = useUiStore((s) => s.panX);
  const panY = useUiStore((s) => s.panY);
  const setZoom = useUiStore((s) => s.setZoom);
  const setPan = useUiStore((s) => s.setPan);
  const layerVisibility = useUiStore((s) => s.layerVisibility);
  const layerOpacity = useUiStore((s) => s.layerOpacity);
  const activeLayer = useUiStore((s) => s.activeLayer);
  const select = useUiStore((s) => s.select);
  const addToSelection = useUiStore((s) => s.addToSelection);
  const clearSelection = useUiStore((s) => s.clearSelection);

  // Panning state refs (not React state — no re-render needed mid-drag)
  const isPanning = useRef(false);
  const panStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

  const view = { panX, panY, zoom };

  // Render grid layer
  useEffect(() => {
    const canvas = gridCanvasRef.current;
    if (!canvas || width === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    renderGrid(ctx, {
      widthFt: garden.widthFt,
      heightFt: garden.heightFt,
      cellSizeFt: garden.gridCellSizeFt,
      view,
      canvasWidth: width,
      canvasHeight: height,
    });
  }, [garden.widthFt, garden.heightFt, garden.gridCellSizeFt, zoom, panX, panY, width, height, dpr]);

  // Render structures layer
  useEffect(() => {
    const canvas = structureCanvasRef.current;
    if (!canvas || width === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    if (layerVisibility.structures) {
      renderStructures(ctx, garden.structures, view, width, height, layerOpacity.structures);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  }, [garden.structures, zoom, panX, panY, width, height, dpr, layerVisibility.structures, layerOpacity.structures]);

  // Render zones layer
  useEffect(() => {
    const canvas = zoneCanvasRef.current;
    if (!canvas || width === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    if (layerVisibility.zones) {
      renderZones(ctx, garden.zones, view, width, height, layerOpacity.zones);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  }, [garden.zones, zoom, panX, panY, width, height, dpr, layerVisibility.zones, layerOpacity.zones]);

  // Render plantings layer
  useEffect(() => {
    const canvas = plantingCanvasRef.current;
    if (!canvas || width === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    if (layerVisibility.plantings) {
      renderPlantings(ctx, garden.plantings, garden.zones, view, width, height, layerOpacity.plantings);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  }, [garden.plantings, garden.zones, zoom, panX, panY, width, height, dpr, layerVisibility.plantings, layerOpacity.plantings]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { panX, panY, zoom } = useUiStore.getState();
      const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, { panX, panY, zoom });
      const { garden } = useGardenStore.getState();
      const { activeLayer: currentActiveLayer } = useUiStore.getState();
      const hit = hitTestObjects(worldX, worldY, garden.structures, garden.zones, currentActiveLayer);
      if (hit) {
        if (e.shiftKey) {
          addToSelection(hit.id);
        } else {
          select(hit.id);
        }
      } else {
        clearSelection();
      }
    }
    if (e.button === 2) {
      isPanning.current = true;
      panStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        panX: useUiStore.getState().panX,
        panY: useUiStore.getState().panY,
      };
    }
  }, [select, addToSelection, clearSelection]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.mouseX;
    const dy = e.clientY - panStart.current.mouseY;
    setPan(panStart.current.panX + dx, panStart.current.panY + dy);
  }, [setPan]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) {
      isPanning.current = false;
    }
  }, []);

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
    const currentState = useUiStore.getState();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(10, Math.max(0.1, currentState.zoom * factor));

    // Mouse position relative to container
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // World coords under mouse before zoom change
    const worldX = (mouseX - currentState.panX) / currentState.zoom;
    const worldY = (mouseY - currentState.panY) / currentState.zoom;

    // Adjust pan so world point stays under mouse after zoom change
    const newPanX = mouseX - worldX * newZoom;
    const newPanY = mouseY - worldY * newZoom;

    setZoom(newZoom);
    setPan(newPanX, newPanY);
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
      style={{ width: '100%', height: '100%', position: 'relative', background: '#E8E0D0' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <canvas ref={gridCanvasRef} style={canvasStyle} />
      <canvas ref={structureCanvasRef} style={canvasStyle} />
      <canvas ref={zoneCanvasRef} style={canvasStyle} />
      <canvas ref={plantingCanvasRef} style={canvasStyle} />
    </div>
  );
}
