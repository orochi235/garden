import type { RenderLayer } from '@orochi235/weasel';
import { Canvas, useCanvasSize, useTools } from '@orochi235/weasel';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGardenStore } from '../store/gardenStore';
import { useHighlightStore, useHighlightTick } from '../store/highlightStore';
import { useUiStore } from '../store/uiStore';
import {
  createNurserySceneAdapter,
  type ScenePose,
  type SeedNode,
  trayWorldOrigin,
} from './adapters/nurseryScene';
import { isDebugEnabled } from './debug';
import { createAreaSelectDrag } from './drag/areaSelectDrag';
import { createDragPreviewLayer } from './drag/dragPreviewLayer';
import { createSeedFillTrayDrag } from './drag/seedFillTrayDrag';
import { createSeedlingMoveDrag } from './drag/seedlingMoveDrag';
import { createDebugLayers } from './layers/debugLayers';
import { setRegisteredLayers } from './layers/renderLayerRegistry';
import { createSeedlingLayers, type SeedlingLayerUi } from './layers/seedlingLayersWorld';
import { createAllHandlesLayer } from './layers/selectionLayersWorld';
import { createSystemLayers } from './layers/systemLayersWorld';
import { createTrayLayers } from './layers/trayLayersWorld';
import { wrapLayersWithVisibility } from './layers/visibilityWrap';
import { computeFitView, fromKitView, toKitView, type View } from './layers/worldLayerData';
import { onIconLoad } from './plantRenderers';
import { useEricClickZoomTool } from './tools/useEricClickZoomTool';
import { useEricRightDragPan } from './tools/useEricRightDragPan';
import { useEricWheelZoomTool } from './tools/useEricWheelZoomTool';
import { useFillTrayTool } from './tools/useFillTrayTool';
import { usePaletteDropTool } from './tools/usePaletteDropTool';
import { useSeedlingMoveTool } from './tools/useSeedlingMoveTool';
import { useSeedSelectTool } from './tools/useSeedSelectTool';
import { useSowCellTool } from './tools/useSowCellTool';

const SEED_MIN_ZOOM = 5;
const SEED_MAX_ZOOM = 100;
const DEFAULT_SEED_ZOOM = 30;

export function NurseryCanvas() {
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
  // Captured (not just subscribed) so it can drive the `layers` memo below:
  // drag ghosts and the gutter-affordance overlay only repaint when weasel
  // sees a fresh `layers` ref, and the dispatcher does NOT bump gestureTick on
  // every pointermove (only on phase transitions). Mirrors the garden canvas.
  const dragPreview = useUiStore((s) => s.dragPreview);
  useUiStore((s) => s.showSeedlingWarnings);
  useUiStore((s) => s.renderLayerVisibility);
  useHighlightTick();

  const [iconTick, setIconTick] = useState(0);
  useEffect(() => onIconLoad(() => setIconTick((t) => t + 1)), []);

  // Adapter is stateless wrt mount — recreate is fine.
  const adapter = useMemo(() => createNurserySceneAdapter(), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the layer getters read latest store state at call time; the deps below are intentional redraw triggers. iconTick — icon bitmap decode. dragPreview — drag ghosts + gutter-affordance overlay repaint during a drag (the dispatcher only bumps gestureTick on phase transitions, not per pointermove). nursery.seedlings/trays — committed moves/sows mutate these arrays; without the dep weasel keeps the stale layers ref and never repaints (same fix as the garden canvas).
  const layers = useMemo(() => {
    const getTrays = () => {
      // Multi-tray auto-flow: render every tray in insertion order. Each layer
      // applies the per-tray world transform via `trayWorldOrigin`.
      return useGardenStore.getState().garden.nursery.trays;
    };
    const getSeedlings = () => useGardenStore.getState().garden.nursery.seedlings;
    const getSeedlingUi = (): SeedlingLayerUi => {
      const u = useUiStore.getState();
      return {
        showWarnings: u.showSeedlingWarnings,
        selectedIds: u.selectedIds,
        hiddenSeedlingIds: u.hiddenSeedlingIds,
      };
    };

    const getHighlight = (id: string) => useHighlightStore.getState().computeOpacity(id);

    // Putative-drag preview layer — dispatches to every migrated drag via
    // the registry. The seed-fill-tray drag owns its own rendering as of
    // the 2026-05-11 close-out; no legacy fill-preview layer remains.
    const dragPreviewRegistry = {
      [createSeedFillTrayDrag({ getCultivarId: () => null }).kind]: createSeedFillTrayDrag({
        getCultivarId: () => null,
      }),
      [createSeedlingMoveDrag().kind]: createSeedlingMoveDrag(),
      [createAreaSelectDrag().kind]: createAreaSelectDrag(),
    };
    const baseList: RenderLayer<unknown>[] = [
      ...createTrayLayers(getTrays),
      ...createSeedlingLayers(getTrays, getSeedlings, getSeedlingUi, getHighlight),
      createDragPreviewLayer(dragPreviewRegistry as never),
      ...createSystemLayers(),
    ];
    const debugLayers = createDebugLayers('nursery', () => useGardenStore.getState().garden);
    if (isDebugEnabled('handles')) {
      debugLayers.push(
        createAllHandlesLayer({
          getTrays,
          getSeedlings,
        }),
      );
    }
    setRegisteredLayers('nursery', [...baseList, ...debugLayers]);
    const list = [
      ...wrapLayersWithVisibility(baseList, () => useUiStore.getState().renderLayerVisibility),
      ...debugLayers,
    ];
    const map: Record<string, { layer: RenderLayer<unknown> }> = {};
    list.forEach((l) => {
      map[l.id] = { layer: l };
    });
    return map;
    // iconTick — see plant-icon redraw note in CanvasNewPrototype.
  }, [iconTick, dragPreview, garden.nursery.seedlings, garden.nursery.trays]);

  // View state lives locally — the canvas owns its own viewport. Outside actors
  // (palette drag, reset action) talk to us via `palettePointerPayload` and
  // `nurseryViewResetTick` in `useUiStore` rather than mirrored fields.
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: DEFAULT_SEED_ZOOM });
  // Mirror to a ref so document-level pointer listeners (palette drop tool)
  // can read the latest view without re-attaching listeners every frame.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const BASE_SEED_ZOOM = 30; // px/in at "100%"

  const handleViewChange = (kitNext: Parameters<typeof fromKitView>[0]) => {
    const next: View = fromKitView(kitNext);
    const scale = Math.min(SEED_MAX_ZOOM, Math.max(SEED_MIN_ZOOM, next.scale));
    const clamped = { x: next.x, y: next.y, scale };
    setView(clamped);
    useUiStore.getState().setCanvasZoomPct(Math.round((scale / BASE_SEED_ZOOM) * 100));
  };

  // Fit the current tray on first useful layout, on tray change, and on
  // explicit reset requests. Doesn't run while the user is mid-drag because
  // setView is the only mutator and reset only fires through this hook.
  const resetTick = useUiStore((s) => s.nurseryViewResetTick);
  const fitViewToTray = (containerW: number, containerH: number) => {
    const ss = useGardenStore.getState().garden.nursery;
    const tray = ss.trays.find((t) => t.id === useUiStore.getState().currentTrayId);
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
  const tray = garden.nursery.trays.find((t) => t.id === currentTrayId);
  const trayDimsKey = tray ? `${tray.widthIn.toFixed(2)}x${tray.heightIn.toFixed(2)}` : 'none';
  const lastFitKeyRef = useRef<string>('');
  // biome-ignore lint/correctness/useExhaustiveDependencies: fitViewToTray is recreated each render; the fit-key guard (currentTrayId/trayDimsKey/width/height) owns when a refit runs.
  useEffect(() => {
    if (width === 0 || height === 0 || !currentTrayId) return;
    const key = `${currentTrayId}:${trayDimsKey}:${width}x${height}`;
    if (lastFitKeyRef.current === key) return;
    lastFitKeyRef.current = key;
    fitViewToTray(width, height);
  }, [width, height, currentTrayId, trayDimsKey]);
  // Reset action.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally fires only on resetTick; width/height/fitViewToTray are read at the latest value via closure.
  useEffect(() => {
    if (resetTick === 0) return;
    if (width === 0 || height === 0) return;
    fitViewToTray(width, height);
  }, [resetTick]);

  // Unified zoom requests from the status bar / keyboard.
  const canvasZoomRequest = useUiStore((s) => s.canvasZoomRequest);
  const prevZoomReqRef = useRef(canvasZoomRequest);
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally fires only on canvasZoomRequest; width/height/fitViewToTray are read at the latest value via closure.
  useEffect(() => {
    const req = canvasZoomRequest;
    if (!req || req === prevZoomReqRef.current) return;
    prevZoomReqRef.current = req;
    if (req === 'reset-fit') {
      fitViewToTray(width, height);
    } else {
      const factor = req === 'zoom-in' ? 1.25 : 0.8;
      setView((prev) => {
        const scale = Math.min(SEED_MAX_ZOOM, Math.max(SEED_MIN_ZOOM, prev.scale * factor));
        const cx = prev.x + width / 2 / prev.scale;
        const cy = prev.y + height / 2 / prev.scale;
        const next = { x: cx - width / 2 / scale, y: cy - height / 2 / scale, scale };
        useUiStore.getState().setCanvasZoomPct(Math.round((scale / BASE_SEED_ZOOM) * 100));
        return next;
      });
    }
    useUiStore.getState().setCanvasZoomRequest(null);
  }, [canvasZoomRequest]);

  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Two rAFs guarantee the renderer has had a chance to paint at least one frame.
    requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
  }, []);

  // --- Tray label rename overlay ---
  const [renaming, setRenaming] = useState<{ trayId: string; value: string } | null>(null);
  const renameTray = useGardenStore((s) => s.renameTray);

  const handleLabelClick = useCallback((trayId: string) => {
    const ss = useGardenStore.getState().garden.nursery;
    const tray = ss.trays.find((t) => t.id === trayId);
    if (tray) setRenaming({ trayId, value: tray.label });
  }, []);

  const commitRename = useCallback(
    (trayId: string, value: string) => {
      const trimmed = value.trim();
      if (trimmed) renameTray(trayId, trimmed);
      setRenaming(null);
    },
    [renameTray],
  );

  // --- Tools ---
  const moveTool = useSeedlingMoveTool(adapter);
  const selectTool = useSeedSelectTool(adapter, { onLabelClick: handleLabelClick, viewRef });
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

  // moveTool is the primary active tool: it handles seedling drag and
  // click-to-select on seedlings. selectTool runs in alwaysOn AFTER moveTool
  // so it claims pointer-down events that moveTool passes (i.e. empty tray
  // background) and draws a marquee on drag. Sow tool runs alongside (claims
  // only when seedDragCultivarId is set); fill tool occupies the shift
  // modifier slot. When the toolbar arms zoom mode the click-zoom tool takes
  // over the active slot.
  const tools = useTools({
    active: activeToolId,
    registry: {
      [moveTool.id]: moveTool,
      [clickZoom.id]: clickZoom,
    },
    ambient: [selectTool, sowTool, fillTool, rightDragPan, wheelZoom],
  });

  // Subscribe so React re-renders when highlight pulses; computeOpacity reads
  // happen during paint in the layer closures.
  void useHighlightStore;

  return (
    <div
      ref={containerRef}
      data-canvas-container
      data-canvas-ready={ready ? 'true' : 'false'}
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
          view={toKitView(view)}
          onViewChange={handleViewChange}
          layers={layers}
          tools={tools}
        />
      )}
      {renaming &&
        (() => {
          const ss = useGardenStore.getState().garden.nursery;
          const tray = ss.trays.find((t) => t.id === renaming.trayId);
          if (!tray) return null;
          const o = trayWorldOrigin(tray, ss);
          const v = view;
          const left = (o.x - v.x) * v.scale;
          const top = (o.y + tray.heightIn - v.y) * v.scale + 6;
          const w = tray.widthIn * v.scale;
          return (
            <input
              value={renaming.value}
              onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(renaming.trayId, renaming.value);
                if (e.key === 'Escape') setRenaming(null);
              }}
              onBlur={() => commitRename(renaming.trayId, renaming.value)}
              style={{
                position: 'absolute',
                left,
                top,
                width: w,
                fontSize: 12,
                textAlign: 'center',
                background: 'rgba(0,0,0,0.75)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.4)',
                borderRadius: 3,
                padding: '1px 4px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          );
        })()}
    </div>
  );
}
