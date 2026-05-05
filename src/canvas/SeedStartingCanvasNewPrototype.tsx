import { useEffect, useMemo, useRef, useState } from 'react';
import { onIconLoad } from './plantRenderers';
import {
  Canvas,
  useCanvasSize,
  useTools,
} from '@orochi235/weasel';
import { useEricWheelZoomTool } from './tools/useEricWheelZoomTool';
import type { RenderLayer } from '@orochi235/weasel';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { useHighlightStore, useHighlightTick } from '../store/highlightStore';
import {
  createSeedStartingSceneAdapter,
  seedStartingWorldBounds,
  type SeedNode,
  type ScenePose,
} from './adapters/seedStartingScene';
import { createTrayLayers } from './layers/trayLayersWorld';
import { createSeedlingLayers, type SeedlingLayerUi } from './layers/seedlingLayersWorld';
import type { View } from './layers/worldLayerData';
import { useEricRightDragPan } from './tools/useEricRightDragPan';
import { useSeedlingMoveTool } from './tools/useSeedlingMoveTool';
import { useSowCellTool } from './tools/useSowCellTool';
import { useFillTrayTool } from './tools/useFillTrayTool';
import { wrapLayersWithVisibility } from './layers/visibilityWrap';
import { createDebugLayers } from './layers/debugLayers';
import { setRegisteredLayers } from './layers/renderLayerRegistry';

export function SeedStartingCanvasNewPrototype() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useCanvasSize(containerRef);
  const garden = useGardenStore((s) => s.garden);
  // Subscribe so that switching the current tray triggers a re-render of layers.
  useUiStore((s) => s.currentTrayId);

  useUiStore((s) => s.selectedIds);
  useUiStore((s) => s.hiddenSeedlingIds);
  useUiStore((s) => s.seedFillPreview);
  useUiStore((s) => s.seedMovePreview);
  useUiStore((s) => s.showSeedlingWarnings);
  useUiStore((s) => s.renderLayerVisibility);
  useHighlightTick();

  const [, setIconTick] = useState(0);
  useEffect(() => onIconLoad(() => setIconTick((t) => t + 1)), []);

  // Adapter is stateless wrt mount — recreate is fine.
  const adapter = useMemo(() => createSeedStartingSceneAdapter(), []);

  const layers = useMemo(() => {
    const getTrays = () => {
      // Multi-tray auto-flow: render every tray in insertion order. Each layer
      // applies the per-tray world transform via `trayWorldOrigin`.
      return useGardenStore.getState().garden.seedStarting.trays;
    };
    const getSeedlings = () => useGardenStore.getState().garden.seedStarting.seedlings;
    const getSeedlingUi = (): SeedlingLayerUi => {
      const u = useUiStore.getState();
      return {
        showWarnings: u.showSeedlingWarnings,
        selectedIds: u.selectedIds,
        hiddenSeedlingIds: u.hiddenSeedlingIds,
        fillPreview: u.seedFillPreview,
        movePreview: u.seedMovePreview,
      };
    };

    const getHighlight = (id: string) => useHighlightStore.getState().computeOpacity(id);

    const baseList: RenderLayer<unknown>[] = [
      ...createTrayLayers(getTrays),
      ...createSeedlingLayers(getTrays, getSeedlings, getSeedlingUi, getHighlight),
    ];
    const debugLayers = createDebugLayers('seed-starting', () => useGardenStore.getState().garden);
    setRegisteredLayers('seed-starting', [...baseList, ...debugLayers]);
    const list = [
      ...wrapLayersWithVisibility(baseList, () => useUiStore.getState().renderLayerVisibility),
      ...debugLayers,
    ];
    const map: Record<string, { layer: RenderLayer<unknown> }> = {};
    list.forEach((l) => { map[l.id] = { layer: l }; });
    return map;
  }, []);

  const seedZoom = useUiStore((s) => s.seedStartingZoom);
  const seedPanX = useUiStore((s) => s.seedStartingPanX);
  const seedPanY = useUiStore((s) => s.seedStartingPanY);

  const view = useMemo<View>(() => {
    if (width === 0 || height === 0) return { x: 0, y: 0, scale: 1 };
    const bounds = seedStartingWorldBounds(garden.seedStarting);
    const ppi = seedZoom;
    // World bounds (sum of tray widths + gutters) centered in the container with
    // optional pan offset. Single-tray gardens have bounds == tray dims, so this
    // matches legacy behavior exactly.
    const originX = (width - bounds.width * ppi) / 2 + seedPanX;
    const originY = (height - bounds.height * ppi) / 2 + seedPanY;
    return { x: -originX / ppi, y: -originY / ppi, scale: ppi };
  }, [width, height, seedZoom, seedPanX, seedPanY, garden.seedStarting]);

  const handleViewChange = (next: View) => {
    const ui = useUiStore.getState();
    const bounds = seedStartingWorldBounds(
      useGardenStore.getState().garden.seedStarting,
    );
    ui.setSeedStartingZoom(next.scale);
    const originX = -next.x * next.scale;
    const originY = -next.y * next.scale;
    const centerOffsetX = (width - bounds.width * next.scale) / 2;
    const centerOffsetY = (height - bounds.height * next.scale) / 2;
    ui.setSeedStartingPan(originX - centerOffsetX, originY - centerOffsetY);
  };

  // --- Tools ---
  const moveTool = useSeedlingMoveTool(adapter);
  const sowTool = useSowCellTool();
  const fillTool = useFillTrayTool();
  const rightDragPan = useEricRightDragPan();
  const wheelZoom = useEricWheelZoomTool();

  // moveTool is the primary active tool: it handles seedling drag,
  // click-to-select, and marquee area-select on empty space. Sow tool runs
  // alongside (claims only when seedDragCultivarId is set); fill tool
  // occupies the shift modifier slot.
  const tools = useTools({
    active: moveTool.id,
    registry: {
      [moveTool.id]: moveTool,
    },
    alwaysOn: [sowTool, fillTool, rightDragPan, wheelZoom],
  });

  // Subscribe so React re-renders when highlight pulses; computeOpacity reads
  // happen during paint in the layer closures.
  void useHighlightStore;

  return (
    <div
      ref={containerRef}
      data-canvas-container
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#1b1b1b',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {width > 0 && height > 0 && (
        <Canvas<SeedNode, ScenePose>
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
