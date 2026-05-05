import { useEffect, useMemo, useRef, useState } from 'react';
import { onIconLoad } from './plantRenderers';
import {
  Canvas,
  useCanvasSize,
  useTools,
} from '@orochi235/weasel';
import { useEricWheelZoomTool } from './tools/useEricWheelZoomTool';
import { useEricClickZoomTool } from './tools/useEricClickZoomTool';
import type { RenderLayer } from '@orochi235/weasel';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { useHighlightStore, useHighlightTick } from '../store/highlightStore';
import {
  createSeedStartingSceneAdapter,
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
import { createAllHandlesLayer } from './layers/selectionLayersWorld';
import { isDebugEnabled } from './debug';
import { setRegisteredLayers } from './layers/renderLayerRegistry';

export function SeedStartingCanvasNewPrototype() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useCanvasSize(containerRef);
  const garden = useGardenStore((s) => s.garden);
  const currentTrayId = useUiStore((s) => s.currentTrayId);
  const armedCultivarId = useUiStore((s) => s.armedCultivarId);
  const setArmedCultivarId = useUiStore((s) => s.setArmedCultivarId);

  // Escape and right-click disarm. Only listen while armed.
  useEffect(() => {
    if (!armedCultivarId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setArmedCultivarId(null);
    }
    function onContext() {
      setArmedCultivarId(null);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('contextmenu', onContext);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('contextmenu', onContext);
    };
  }, [armedCultivarId, setArmedCultivarId]);

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
      const ss = useGardenStore.getState().garden.seedStarting;
      // Restrict to the current tray (legacy behavior shows one tray at a time).
      const id = useUiStore.getState().currentTrayId;
      if (!id) return ss.trays;
      const t = ss.trays.find((x) => x.id === id);
      return t ? [t] : [];
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
    if (isDebugEnabled('handles')) {
      debugLayers.push(createAllHandlesLayer({
        getTrays,
        getSeedlings,
      }));
    }
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
    const tray = garden.seedStarting.trays.find((t) => t.id === currentTrayId);
    const trayW = tray?.widthIn ?? 0;
    const trayH = tray?.heightIn ?? 0;
    const ppi = seedZoom;
    // Legacy: tray centered in container with optional pan. Convert (originX,originY,ppi)
    // to view: screenX = (worldX - view.x) * scale ⇒ view.x = -originX/scale.
    const originX = (width - trayW * ppi) / 2 + seedPanX;
    const originY = (height - trayH * ppi) / 2 + seedPanY;
    return { x: -originX / ppi, y: -originY / ppi, scale: ppi };
  }, [width, height, seedZoom, seedPanX, seedPanY, garden.seedStarting.trays, currentTrayId]);

  const handleViewChange = (next: View) => {
    const ui = useUiStore.getState();
    const tray = useGardenStore.getState().garden.seedStarting.trays.find(
      (t) => t.id === ui.currentTrayId,
    );
    const trayW = tray?.widthIn ?? 0;
    const trayH = tray?.heightIn ?? 0;
    ui.setSeedStartingZoom(next.scale);
    // Invert: originX = -view.x * scale; pan = originX - centerOffset.
    const originX = -next.x * next.scale;
    const originY = -next.y * next.scale;
    const centerOffsetX = (width - trayW * next.scale) / 2;
    const centerOffsetY = (height - trayH * next.scale) / 2;
    ui.setSeedStartingPan(originX - centerOffsetX, originY - centerOffsetY);
  };

  // --- Tools ---
  const moveTool = useSeedlingMoveTool(adapter);
  const sowTool = useSowCellTool();
  const fillTool = useFillTrayTool();
  const rightDragPan = useEricRightDragPan();
  const wheelZoom = useEricWheelZoomTool();
  const clickZoom = useEricClickZoomTool();

  const viewMode = useUiStore((s) => s.viewMode);
  const activeToolId = viewMode === 'zoom' ? clickZoom.id : moveTool.id;

  // moveTool is the primary active tool: it handles seedling drag,
  // click-to-select, and marquee area-select on empty space. Sow tool runs
  // alongside (claims only when seedDragCultivarId is set); fill tool
  // occupies the shift modifier slot. When the toolbar arms zoom mode the
  // click-zoom tool takes over the active slot.
  const tools = useTools({
    active: activeToolId,
    registry: {
      [moveTool.id]: moveTool,
      [clickZoom.id]: clickZoom,
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
        cursor: armedCultivarId ? 'crosshair' : undefined,
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
