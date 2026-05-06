import { useEffect, useMemo, useRef, useState } from 'react';
import { onIconLoad } from './plantRenderers';
import {
  Canvas,
  computeFitView,
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
  trayWorldOrigin,
  type SeedNode,
  type ScenePose,
} from './adapters/seedStartingScene';
import { createTrayLayers } from './layers/trayLayersWorld';
import { createSeedlingLayers, type SeedlingLayerUi } from './layers/seedlingLayersWorld';
import { createSystemLayers } from './layers/systemLayersWorld';
import type { View } from './layers/worldLayerData';
import { useEricRightDragPan } from './tools/useEricRightDragPan';
import { useSeedlingMoveTool } from './tools/useSeedlingMoveTool';
import { useSowCellTool } from './tools/useSowCellTool';
import { useFillTrayTool } from './tools/useFillTrayTool';
import { usePaletteDropTool } from './tools/usePaletteDropTool';
import { createDragPreviewLayer } from './drag/dragPreviewLayer';
import { createSeedFillTrayDrag } from './drag/seedFillTrayDrag';
import { wrapLayersWithVisibility } from './layers/visibilityWrap';
import { createDebugLayers } from './layers/debugLayers';
import { createAllHandlesLayer } from './layers/selectionLayersWorld';
import { isDebugEnabled } from './debug';
import { setRegisteredLayers } from './layers/renderLayerRegistry';

const SEED_MIN_ZOOM = 5;
const SEED_MAX_ZOOM = 100;
const DEFAULT_SEED_ZOOM = 30;

export function SeedStartingCanvasNewPrototype() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useCanvasSize(containerRef);
  const garden = useGardenStore((s) => s.garden);
  // Subscribe so that switching the current tray triggers a re-render of layers.
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
  useUiStore((s) => s.dragPreview);
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

    // Putative-drag preview layer — Phase 1 dispatches to the seed-fill-tray
    // drag (whose renderPreview is a no-op since the legacy
    // `seedling-fill-preview` layer keeps drawing via mirrored
    // `seedFillPreview`). Phase 2+ migrations will plug in here.
    const dragPreviewRegistry = {
      [createSeedFillTrayDrag({ getCultivarId: () => null }).kind]:
        createSeedFillTrayDrag({ getCultivarId: () => null }),
    };
    const baseList: RenderLayer<unknown>[] = [
      ...createTrayLayers(getTrays),
      ...createSeedlingLayers(getTrays, getSeedlings, getSeedlingUi, getHighlight),
      createDragPreviewLayer(dragPreviewRegistry as never),
      ...createSystemLayers(),
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

  // View state lives locally — the canvas owns its own viewport. Outside actors
  // (palette drag, reset action) talk to us via `palettePointerPayload` and
  // `seedStartingViewResetTick` in `useUiStore` rather than mirrored fields.
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: DEFAULT_SEED_ZOOM });
  // Mirror to a ref so document-level pointer listeners (palette drop tool)
  // can read the latest view without re-attaching listeners every frame.
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  const handleViewChange = (next: View) => {
    // Clamp zoom (px-per-inch) to the seed-starting range; the kit's wheel
    // zoom tool already clamps to its own min/max, but local edits and
    // future tools shouldn't bypass those bounds.
    const scale = Math.min(SEED_MAX_ZOOM, Math.max(SEED_MIN_ZOOM, next.scale));
    setView({ x: next.x, y: next.y, scale });
  };

  // Fit the current tray on first useful layout, on tray change, and on
  // explicit reset requests. Doesn't run while the user is mid-drag because
  // setView is the only mutator and reset only fires through this hook.
  const resetTick = useUiStore((s) => s.seedStartingViewResetTick);
  const fitViewToTray = (containerW: number, containerH: number) => {
    const ss = useGardenStore.getState().garden.seedStarting;
    const tray = ss.trays.find(
      (t) => t.id === useUiStore.getState().currentTrayId,
    );
    if (!tray) return;
    const fit = computeFitView(containerW, containerH, tray.widthIn, tray.heightIn);
    // computeFitView returns garden-style {zoom, panX, panY} — convert to our
    // camera-coord View. Kit's zoom is the canvas's scale; centerOffset puts
    // the tray's top-left at (panX, panY) on screen ⇒ view.x = trayOriginX -
    // panX / scale, accounting for the tray's position in multi-tray world.
    const scale = Math.min(SEED_MAX_ZOOM, Math.max(SEED_MIN_ZOOM, fit.zoom));
    const o = trayWorldOrigin(tray, ss);
    setView({ x: o.x - fit.panX / scale, y: o.y - fit.panY / scale, scale });
  };
  // Initial fit / refit when tray or container size changes. The fit-key
  // includes tray dimensions so a tray edit (resize rows/cols) also refits.
  const tray = garden.seedStarting.trays.find((t) => t.id === currentTrayId);
  const trayDimsKey = tray ? `${tray.widthIn.toFixed(2)}x${tray.heightIn.toFixed(2)}` : 'none';
  const lastFitKeyRef = useRef<string>('');
  useEffect(() => {
    if (width === 0 || height === 0 || !currentTrayId) return;
    const key = `${currentTrayId}:${trayDimsKey}:${width}x${height}`;
    if (lastFitKeyRef.current === key) return;
    lastFitKeyRef.current = key;
    fitViewToTray(width, height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, currentTrayId, trayDimsKey]);
  // Reset action.
  useEffect(() => {
    if (resetTick === 0) return;
    if (width === 0 || height === 0) return;
    fitViewToTray(width, height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTick]);

  // --- Tools ---
  const moveTool = useSeedlingMoveTool(adapter);
  const sowTool = useSowCellTool();
  const fillTool = useFillTrayTool();
  const rightDragPan = useEricRightDragPan();
  const wheelZoom = useEricWheelZoomTool();
  const clickZoom = useEricClickZoomTool();
  // The palette drop tool is a non-claiming pseudo-tool: it doesn't take part
  // in the kit dispatcher (palette drags begin off-canvas, so the dispatcher
  // never sees their pointerdown). Instead it watches the `palettePointerPayload`
  // ui slot and runs its own document-level pointer pipeline, reading our
  // local `viewRef` to do screen→world math.
  usePaletteDropTool({ containerRef, viewRef });

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
