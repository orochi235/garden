import { useRef } from 'react';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { screenToWorld, snapToGrid } from '../../utils/grid';

interface PlotDeps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectionCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  width: number;
  height: number;
  dpr: number;
}

export function usePlotInteraction({
  containerRef,
  selectionCanvasRef,
  width,
  height,
  dpr,
}: PlotDeps) {
  const isPlotting = useRef(false);
  const plotStart = useRef({ worldX: 0, worldY: 0 });
  const plotCurrent = useRef({ worldX: 0, worldY: 0 });

  function start(worldX: number, worldY: number, altKey: boolean) {
    const { garden } = useGardenStore.getState();
    const cellSize = garden.gridCellSizeFt;
    const snappedX = altKey ? worldX : snapToGrid(worldX, cellSize);
    const snappedY = altKey ? worldY : snapToGrid(worldY, cellSize);
    isPlotting.current = true;
    plotStart.current = { worldX: snappedX, worldY: snappedY };
    plotCurrent.current = { worldX: snappedX, worldY: snappedY };
  }

  function move(e: React.MouseEvent) {
    if (!isPlotting.current) return false;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const { panX, panY, zoom } = useUiStore.getState();
    const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, {
      panX,
      panY,
      zoom,
    });
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
      ctx.fillStyle = `${plottingTool?.color ?? '#8B6914'}66`;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = plottingTool?.color ?? '#8B6914';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(sx, sy, sw, sh);
    }
    return true;
  }

  function end() {
    if (!isPlotting.current) return;
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
  }

  function cancel() {
    const { plottingTool } = useUiStore.getState();
    if (plottingTool) {
      useUiStore.getState().setPlottingTool(null);
      isPlotting.current = false;
    }
  }

  return { start, move, end, cancel, isPlotting };
}
