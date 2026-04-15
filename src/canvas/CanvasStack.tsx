import { useRef, useEffect, useCallback } from 'react';
import { useCanvasSize } from './useCanvasSize';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { renderGrid } from './renderGrid';
import { renderBlueprint } from './renderBlueprint';
import { renderStructures } from './renderStructures';
import { renderZones } from './renderZones';
import { renderPlantings } from './renderPlantings';
import { screenToWorld, snapToGrid } from '../utils/grid';
import { generateId } from '../model/types';
import type { Structure, Zone, Planting } from '../model/types';
import type { PaletteEntry } from '../components/palette/paletteData';
import { hitTestObjects, hitTestHandles, handleCursor } from './hitTest';
import type { HandlePosition } from './hitTest';
import { renderSelection } from './renderSelection';

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
  const setPlottingTool = useUiStore((s) => s.setPlottingTool);

  // Panning state refs (not React state — no re-render needed mid-drag)
  const isPanning = useRef(false);
  const panStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

  // Move state refs
  const isMoving = useRef(false);
  const moveStart = useRef({ worldX: 0, worldY: 0, objX: 0, objY: 0 });
  const moveObjectId = useRef<string | null>(null);
  const moveObjectLayer = useRef<string | null>(null);

  // Resize state refs
  const isResizing = useRef(false);
  const resizeHandle = useRef<HandlePosition | null>(null);
  const resizeObjectId = useRef<string | null>(null);
  const resizeObjectLayer = useRef<string | null>(null);
  const resizeOriginal = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const resizeStartWorld = useRef({ worldX: 0, worldY: 0 });
  const resizeTarget = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Clipboard for copy/paste
  const clipboard = useRef<{ structures: Structure[]; zones: Zone[]; plantings: Planting[] }>({ structures: [], zones: [], plantings: [] });

  // Plotting state refs
  const isPlotting = useRef(false);
  const plotStart = useRef({ worldX: 0, worldY: 0 });
  const plotCurrent = useRef({ worldX: 0, worldY: 0 });

  const view = { panX, panY, zoom };

  // Fit and center garden in viewport on first render
  const hasCentered = useRef(false);
  useEffect(() => {
    if (width > 0 && height > 0 && !hasCentered.current) {
      hasCentered.current = true;
      const padding = 0.85;
      const fitZoom = Math.min(
        (width * padding) / garden.widthFt,
        (height * padding) / garden.heightFt,
      );
      const { setZoom } = useUiStore.getState();
      setZoom(fitZoom);
      const gardenW = garden.widthFt * fitZoom;
      const gardenH = garden.heightFt * fitZoom;
      setPan((width - gardenW) / 2, (height - gardenH) / 2);
    }
  }, [width, height, garden.widthFt, garden.heightFt, setPan]);

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

  // Render blueprint layer
  useEffect(() => {
    const canvas = blueprintCanvasRef.current;
    if (!canvas || width === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    if (layerVisibility.blueprint) {
      renderBlueprint(ctx, garden.blueprint, view, width, height, layerOpacity.blueprint);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  }, [garden.blueprint, zoom, panX, panY, width, height, dpr, layerVisibility.blueprint, layerOpacity.blueprint]);

  // Re-render blueprint when image finishes loading
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

  // Render selection layer
  useEffect(() => {
    const canvas = selectionCanvasRef.current;
    if (!canvas || width === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    renderSelection(ctx, selectedIds, garden.structures, garden.zones, view, width, height);
  }, [selectedIds, garden.structures, garden.zones, zoom, panX, panY, width, height, dpr]);

  // Keyboard handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          useGardenStore.getState().redo();
        } else {
          useGardenStore.getState().undo();
        }
        return;
      }

      // Copy
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        const ids = useUiStore.getState().selectedIds;
        if (ids.length === 0) return;
        const { garden } = useGardenStore.getState();
        clipboard.current = {
          structures: garden.structures.filter((s) => ids.includes(s.id)),
          zones: garden.zones.filter((z) => ids.includes(z.id)),
          plantings: garden.plantings.filter((p) => ids.includes(p.id)),
        };
        return;
      }

      // Paste
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        const cb = clipboard.current;
        if (cb.structures.length === 0 && cb.zones.length === 0 && cb.plantings.length === 0) return;
        e.preventDefault();
        const { garden } = useGardenStore.getState();
        const cellSize = garden.gridCellSizeFt;
        const offset = cellSize; // offset pasted objects by one grid cell
        const newIds: string[] = [];

        for (const s of cb.structures) {
          const id = generateId();
          newIds.push(id);
          useGardenStore.getState().addStructure({ type: s.type, x: s.x + offset, y: s.y + offset, width: s.width, height: s.height });
          // addStructure generates its own id, so update the last-added structure's position
        }
        for (const z of cb.zones) {
          const id = generateId();
          newIds.push(id);
          useGardenStore.getState().addZone({ x: z.x + offset, y: z.y + offset, width: z.width, height: z.height });
        }

        // Select the pasted objects (they're the last N added)
        const { garden: updated } = useGardenStore.getState();
        const pastedIds: string[] = [];
        if (cb.structures.length > 0) {
          pastedIds.push(...updated.structures.slice(-cb.structures.length).map((s) => s.id));
        }
        if (cb.zones.length > 0) {
          pastedIds.push(...updated.zones.slice(-cb.zones.length).map((z) => z.id));
        }
        if (pastedIds.length > 0) {
          useUiStore.getState().select(pastedIds[0]);
          for (let i = 1; i < pastedIds.length; i++) {
            useUiStore.getState().addToSelection(pastedIds[i]);
          }
        }

        // Update clipboard to point to the pasted copies so repeated paste cascades
        clipboard.current = {
          structures: updated.structures.slice(-cb.structures.length),
          zones: updated.zones.slice(-cb.zones.length),
          plantings: [],
        };
        return;
      }

      if (e.key === 'Escape') {
        const { plottingTool } = useUiStore.getState();
        if (plottingTool) {
          useUiStore.getState().setPlottingTool(null);
          isPlotting.current = false;
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
        const ids = useUiStore.getState().selectedIds;
        const { garden, removeStructure, removeZone, removePlanting } = useGardenStore.getState();
        for (const id of ids) {
          if (garden.structures.find((s) => s.id === id)) removeStructure(id);
          else if (garden.zones.find((z) => z.id === id)) removeZone(id);
          else if (garden.plantings.find((p) => p.id === id)) removePlanting(id);
        }
        useUiStore.getState().clearSelection();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { panX, panY, zoom, plottingTool } = useUiStore.getState();
      const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, { panX, panY, zoom });

      // Plotting mode: start drawing a rectangle
      if (plottingTool) {
        const { garden } = useGardenStore.getState();
        const cellSize = garden.gridCellSizeFt;
        const snappedX = e.altKey ? worldX : snapToGrid(worldX, cellSize);
        const snappedY = e.altKey ? worldY : snapToGrid(worldY, cellSize);
        isPlotting.current = true;
        plotStart.current = { worldX: snappedX, worldY: snappedY };
        plotCurrent.current = { worldX: snappedX, worldY: snappedY };
        return;
      }

      const { garden } = useGardenStore.getState();
      const { activeLayer: currentActiveLayer, selectedIds: currentSelectedIds } = useUiStore.getState();

      // Check resize handles first
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const handleHit = hitTestHandles(screenX, screenY, currentSelectedIds, garden.structures, garden.zones, { panX, panY, zoom });
      if (handleHit) {
        const obj = handleHit.layer === 'structures'
          ? garden.structures.find((s) => s.id === handleHit.id)
          : garden.zones.find((z) => z.id === handleHit.id);
        if (obj) {
          useGardenStore.getState().checkpoint();
          isResizing.current = true;
          resizeHandle.current = handleHit.handle;
          resizeObjectId.current = handleHit.id;
          resizeObjectLayer.current = handleHit.layer;
          resizeOriginal.current = { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
          resizeStartWorld.current = { worldX, worldY };
        }
        return;
      }
      const hit = hitTestObjects(worldX, worldY, garden.structures, garden.zones, currentActiveLayer);
      if (hit) {
        if (e.shiftKey) {
          addToSelection(hit.id);
        } else {
          select(hit.id);
        }
        // Set up move
        const obj =
          hit.layer === 'structures'
            ? garden.structures.find((s) => s.id === hit.id)
            : garden.zones.find((z) => z.id === hit.id);
        if (obj) {
          useGardenStore.getState().checkpoint();
          isMoving.current = true;
          moveStart.current = { worldX, worldY, objX: obj.x, objY: obj.y };
          moveObjectId.current = hit.id;
          moveObjectLayer.current = hit.layer;
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
    // Resize mode
    if (isResizing.current && resizeObjectId.current && resizeHandle.current) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { panX, panY, zoom } = useUiStore.getState();
      const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, { panX, panY, zoom });
      const { garden, updateStructure, updateZone } = useGardenStore.getState();
      const cellSize = garden.gridCellSizeFt;
      const snap = (v: number) => e.altKey ? v : snapToGrid(v, cellSize);

      const orig = resizeOriginal.current;
      const handle = resizeHandle.current;

      // Compute snapped target bounds
      let tx = orig.x, ty = orig.y, tw = orig.width, th = orig.height;
      if (handle.includes('e')) tw = snap(worldX) - tx;
      if (handle.includes('w')) { const nx = snap(worldX); tw = orig.x + orig.width - nx; tx = nx; }
      if (handle.includes('s')) th = snap(worldY) - ty;
      if (handle.includes('n')) { const ny = snap(worldY); th = orig.y + orig.height - ny; ty = ny; }

      // Enforce minimum size
      const minSize = cellSize > 0 ? cellSize : 0.5;
      if (tw < minSize) { if (handle.includes('w')) tx = orig.x + orig.width - minSize; tw = minSize; }
      if (th < minSize) { if (handle.includes('n')) ty = orig.y + orig.height - minSize; th = minSize; }

      // Lerp current position toward snap target for smooth animation
      const obj = resizeObjectLayer.current === 'structures'
        ? garden.structures.find((s) => s.id === resizeObjectId.current)
        : garden.zones.find((z) => z.id === resizeObjectId.current);
      const LERP = 0.35;
      const lerp = (a: number, b: number) => a + (b - a) * LERP;
      const x = obj ? lerp(obj.x, tx) : tx;
      const y = obj ? lerp(obj.y, ty) : ty;
      const width = obj ? lerp(obj.width, tw) : tw;
      const height = obj ? lerp(obj.height, th) : th;

      // Store the snap target for final snap on mouseup
      resizeTarget.current = { x: tx, y: ty, width: tw, height: th };

      if (resizeObjectLayer.current === 'structures') {
        updateStructure(resizeObjectId.current, { x, y, width, height });
      } else if (resizeObjectLayer.current === 'zones') {
        updateZone(resizeObjectId.current, { x, y, width, height });
      }
      return;
    }

    // Plotting mode: update preview rectangle
    if (isPlotting.current) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { panX, panY, zoom } = useUiStore.getState();
      const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, { panX, panY, zoom });
      const { garden } = useGardenStore.getState();
      const cellSize = garden.gridCellSizeFt;
      plotCurrent.current = {
        worldX: e.altKey ? worldX : snapToGrid(worldX, cellSize),
        worldY: e.altKey ? worldY : snapToGrid(worldY, cellSize),
      };
      // Render preview on selection canvas
      const canvas = selectionCanvasRef.current;
      if (canvas && width > 0) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(dpr, dpr);
        const x = Math.min(plotStart.current.worldX, plotCurrent.current.worldX);
        const y = Math.min(plotStart.current.worldY, plotCurrent.current.worldY);
        const w = Math.abs(plotCurrent.current.worldX - plotStart.current.worldX);
        const h = Math.abs(plotCurrent.current.worldY - plotStart.current.worldY);
        const { plottingTool } = useUiStore.getState();
        const view = { panX, panY, zoom };
        const sx = view.panX + x * view.zoom;
        const sy = view.panY + y * view.zoom;
        const sw = w * view.zoom;
        const sh = h * view.zoom;
        ctx.fillStyle = (plottingTool?.color ?? '#8B6914') + '66';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = plottingTool?.color ?? '#8B6914';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(sx, sy, sw, sh);
      }
      return;
    }

    if (isMoving.current && moveObjectId.current) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { panX, panY, zoom } = useUiStore.getState();
      const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, { panX, panY, zoom });
      const deltaX = worldX - moveStart.current.worldX;
      const deltaY = worldY - moveStart.current.worldY;
      const newX = moveStart.current.objX + deltaX;
      const newY = moveStart.current.objY + deltaY;
      const { garden, updateStructure, updateZone } = useGardenStore.getState();
      const cellSize = garden.gridCellSizeFt;
      const snappedX = e.altKey ? newX : snapToGrid(newX, cellSize);
      const snappedY = e.altKey ? newY : snapToGrid(newY, cellSize);
      if (moveObjectLayer.current === 'structures') {
        updateStructure(moveObjectId.current, { x: snappedX, y: snappedY });
      } else if (moveObjectLayer.current === 'zones') {
        updateZone(moveObjectId.current, { x: snappedX, y: snappedY });
      }
      return;
    }
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.mouseX;
    const dy = e.clientY - panStart.current.mouseY;
    setPan(panStart.current.panX + dx, panStart.current.panY + dy);
  }, [setPan]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      // Finish plotting
      if (isPlotting.current) {
        isPlotting.current = false;
        const x = Math.min(plotStart.current.worldX, plotCurrent.current.worldX);
        const y = Math.min(plotStart.current.worldY, plotCurrent.current.worldY);
        const w = Math.abs(plotCurrent.current.worldX - plotStart.current.worldX);
        const h = Math.abs(plotCurrent.current.worldY - plotStart.current.worldY);
        const { plottingTool } = useUiStore.getState();
        if (plottingTool && w > 0 && h > 0) {
          const { addStructure, addZone } = useGardenStore.getState();
          if (plottingTool.category === 'structures') {
            addStructure({ type: plottingTool.type, x, y, width: w, height: h });
          } else if (plottingTool.category === 'zones') {
            addZone({ x, y, width: w, height: h });
          }
        }
        // Clear preview
        const canvas = selectionCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }

      // Snap to exact grid on resize end
      if (isResizing.current && resizeObjectId.current) {
        const t = resizeTarget.current;
        const { updateStructure, updateZone } = useGardenStore.getState();
        if (resizeObjectLayer.current === 'structures') {
          updateStructure(resizeObjectId.current, { x: t.x, y: t.y, width: t.width, height: t.height });
        } else if (resizeObjectLayer.current === 'zones') {
          updateZone(resizeObjectId.current, { x: t.x, y: t.y, width: t.width, height: t.height });
        }
      }
      isResizing.current = false;
      resizeHandle.current = null;
      resizeObjectId.current = null;
      resizeObjectLayer.current = null;
      isMoving.current = false;
      moveObjectId.current = null;
      moveObjectLayer.current = null;
    }
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
    const newZoom = Math.min(200, Math.max(10, currentState.zoom * factor));

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
      style={{ width: '100%', height: '100%', position: 'relative', background: groundColor, cursor: plottingTool ? 'crosshair' : 'default' }}
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
    </div>
  );
}
