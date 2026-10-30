import type {
  ActionsProp,
  AnyTool,
  LayoutStrategy,
  MoveBehavior,
  NodeId,
  Op,
  RenderLayer,
  SelectionApi,
  ToolsApi,
} from '@weasel-js/core';
import {
  ActiveToolContextProviderIfRoot,
  defaultCommitAdapter,
  SceneCanvas,
  useCanvasSize,
  useDepSource,
  useRectTool,
} from '@weasel-js/core';
import { createGridLayer } from '@weasel-js/guides';
import { createModeRegistry, type ModeDefinition } from '@weasel-js/modes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type GardenScene, gardenCanDropInto } from '../scene/gardenScene';
import { useGardenStore } from '../store/gardenStore';
import { useHighlightStore, useHighlightTick } from '../store/highlightStore';
import { useUiStore } from '../store/uiStore';
import { expandToGroups } from '../utils/groups';
import { createGardenSceneAdapter, type ScenePose } from './adapters/gardenScene';
import { createInsertAdapter, type GardenInsertAdapter } from './adapters/insert';
import { plantingLayoutFor } from './adapters/plantingLayout';
import { isDebugEnabled } from './debug';
import { createDragPreviewLayer } from './drag/dragPreviewLayer';
import { createGardenPaletteDrag } from './drag/gardenPaletteDrag';
import type { WorldRect } from './hitTest';
import { createStructureClashLayer } from './layers/clashLayer';
import { createDebugLayers } from './layers/debugLayers';
import { createGardenDrawOne } from './layers/gardenDrawOne';
import { createPlantingLayers } from './layers/plantingLayersWorld';
import { setRegisteredLayers } from './layers/renderLayerRegistry';
import { createAllHandlesLayer, createGroupOutlineLayer } from './layers/selectionLayersWorld';
import { createStructureLayers } from './layers/structureLayersWorld';
import { createSystemLayers } from './layers/systemLayersWorld';
import { wrapLayersWithVisibility } from './layers/visibilityWrap';
import {
  computeFitView,
  fromKitView,
  type GetUi,
  toKitView,
  type View,
} from './layers/worldLayerData';
import { createZoneLayers } from './layers/zoneLayersWorld';
import { NurseryCanvas } from './NurseryCanvas';
import { onIconLoad } from './plantRenderers';
import { useGardenSelectionApi } from './selectionBridge';
import { createGardenCloneAction } from './tools/gardenCloneAction';
import { requirePlantingDrop, structureZoneGridSnap } from './tools/snapMoveBehaviors';
import {
  clampStructureZoneToGardenBounds,
  detectStructureClash,
} from './tools/structureMoveBehaviors';
import { createCanvasClickAction, useEricCanvasClickTool } from './tools/useEricCanvasClickTool';
import { useEricSelectAreaTool } from './tools/useEricSelectAreaTool';
import { useGardenPaletteDropTool } from './tools/useGardenPaletteDropTool';
import {
  createClickZoomAction,
  useEricClickZoomTool,
  useEricLeftDragPanTool,
  useRightDragPan,
} from './tools/viewportTools';

export function GardenCanvas() {
  const appMode = useUiStore((s) => s.appMode);
  // HEAD's `useTools` reads `useActiveToolContext()`, which throws without an
  // `ActiveToolContextProvider` ancestor (the pin's `useTools` had no such
  // dependency). Both canvases call `useTools`, so provide the context here —
  // `IfRoot` reuses an outer provider if the app ever adds one higher up.
  return (
    <ActiveToolContextProviderIfRoot>
      {appMode === 'nursery' ? <NurseryCanvas /> : <GardenCanvasInner />}
    </ActiveToolContextProviderIfRoot>
  );
}

// Garden canvas zoom bounds (px-per-foot). Same range we historically clamped
// in `useUiStore.setZoom`; preserved at the canvas now that view state lives
// locally.
const GARDEN_MIN_ZOOM = 10;
const GARDEN_MAX_ZOOM = 200;

function clampZoom(z: number): number {
  return Math.min(GARDEN_MAX_ZOOM, Math.max(GARDEN_MIN_ZOOM, z));
}

/** Garden view modes, gating which kit actions the gesture dispatcher runs:
 *   - normal (select / draw) → kit owns move/resize/area-select.
 *   - select-area   → kit owns area-select only (force-marquee); transforms off.
 *   - insert (plotting) → kit owns insert only.
 *   - pan / zoom    → no kit actions; eric's pan/zoom tools own drags.
 *  Eric's pan/zoom tools carry their own bindings, so without this gate
 *  `moveAction`/`areaSelectAction`'s ambient bindings would also fire on a
 *  pan/zoom drag (double-handling). */
const GARDEN_MODES: ModeDefinition[] = [
  { id: 'normal', allows: ['transforms-selection', 'creates-selection', 'edits-page'] },
  { id: 'select-area', allows: ['creates-selection'] },
  { id: 'insert', allows: ['creates-shapes'] },
  { id: 'pan', allows: [] },
  { id: 'zoom', allows: [] },
].map((m) => ({ ...m, kind: 'soft', scoping: false }));

/** The kit behavior the garden canvas runs: click/marquee selection with its
 *  outline, move (with alt-drag clone), and resize. */
const GARDEN_FEATURES = ['pick', 'move', 'resize'] as const;

function gardenModeId(ui: ReturnType<typeof useUiStore.getState>): string {
  if (ui.plottingTool) return 'insert';
  if (ui.viewMode === 'pan' || ui.viewMode === 'zoom' || ui.viewMode === 'select-area') {
    return ui.viewMode;
  }
  return 'normal';
}

/**
 * Bridges the kit's gesture-commit pipeline into the garden's undo history by
 * registering three deps — `applyOps` (the commit channel), `canDropInto`
 * (which garden nodes take children; every garden node is a mark, which the kit
 * admits nothing into by default), and `layout` (each container's planting
 * layout, read live from the garden instead of stored on its scene node).
 * These live on the dep registry, which only exists inside `<SceneCanvas>`'s tree — so this renders as a CHILD of
 * `<SceneCanvas>`, not a sibling. The kit's default actions (move / resize /
 * delete / nudge / …) consume them:
 *
 *  - `applyOps(ops, label)` routes a gesture's committed ops through eric's own
 *    undo instead of the kit's internal history. We checkpoint the garden store
 *    (eric's snapshot-stack undo) BEFORE applying, then commit the kit's
 *    LOCAL-frame ops to the live scene via `defaultCommitAdapter` — which
 *    applies them directly on scene poses with no world↔local conversion. (Do
 *    NOT use `createGardenSceneAdapter` here: it's world-in and would
 *    double-convert.) The store's scene subscription recomposes `garden`
 *    automatically once the batch lands, so the projection + UI refresh for free.
 */
function GardenHistoryBridge({ scene }: { scene: GardenScene }) {
  useDepSource('applyOps', () => (ops: Op[], label: string) => {
    useGardenStore.getState().checkpoint();
    scene.applyBatch(ops, label, defaultCommitAdapter(scene));
  });
  useDepSource('canDropInto', () => gardenCanDropInto(scene));
  useDepSource('layout', () => ({
    getLayout: (id: string) =>
      plantingLayoutFor(
        () => useGardenStore.getState().garden,
        id,
      ) as LayoutStrategy<unknown> | null,
  }));
  return null;
}

/**
 * Overrides the kit's default `areaSelect` dep (marquee hit-test). The kit
 * default (`hitTestAABB`) reads RAW node poses — parent-LOCAL for eric's nested
 * plantings — and tests them against the world-space marquee, so a plant in a
 * far-right bed (small local x) wrongly matches a top-left marquee. It also
 * skips container nodes, so it can't marquee-select beds/zones. eric's
 * `adapter.hitTestArea` is world-frame, footprint-precise, and container-
 * inclusive — the same domain hit-test the pre-kit marquee used, and the mirror
 * of how `geometry.pickEvery` feeds `adapter.hitAll` for click selection. The
 * `areaSelect` dep is the kit's sanctioned per-consumer override point for
 * exactly this (selection get/set stay on the shared SelectionApi).
 */
function GardenAreaSelectDep({
  adapter,
  selection,
}: {
  adapter: { hitTestArea(rect: WorldRect): string[] };
  selection: SelectionApi;
}) {
  useDepSource('areaSelect', () => ({
    hitTestArea: (bounds) => adapter.hitTestArea(bounds) as NodeId[],
    getSelection: () => selection.get() as NodeId[],
    setSelection: (ids) => selection.set(ids),
  }));
  return null;
}

/**
 * Overrides the kit's default `insert` dep (`useInsertDepSource`), which builds
 * orphan `kit-${kind}` leaf nodes (`{path, fill}`) that eric's scene→garden
 * facade doesn't recognise — so a plot would never land in `garden.structures`.
 * The dispatcher's `insertAction` consumes this dep's `commit`; weasel's
 * `useInsertTool` is a thin declarative wrapper that ignores the adapter/options
 * passed to it, so the adapter MUST be wired through the dep here. Routes the
 * commit through eric's `commitInsert` (reads the armed `plottingTool` and
 * builds a real `Structure`/`Zone`) + `insertNode` (reconciles the new node into
 * the scene-of-record). Same per-consumer override seam as `GardenAreaSelectDep`
 * — registered as a child of `<SceneCanvas>` so it wins over the kit default.
 */
function GardenInsertDep({ insertAdapter }: { insertAdapter: GardenInsertAdapter }) {
  useDepSource('insert', () => ({
    // `extras` (kind/geometry) is irrelevant to eric — the armed `plottingTool`
    // decides structure vs. zone — so only the AABB `bounds` are consumed.
    commit: (bounds): NodeId | null => {
      // `commitInsert` is optional on the base `InsertAdapter` interface but is
      // always defined on eric's adapter; guard to satisfy the type.
      const node = insertAdapter.commitInsert?.(bounds);
      if (!node) return null;
      // One undo step: snapshot BEFORE the insert, then add. `insertNode` routes
      // through `applyGardenPatch` → `reconcileScene` (no checkpoint of its own).
      useGardenStore.getState().checkpoint();
      insertAdapter.insertNode(node);
      return node.id as NodeId;
    },
  }));
  return null;
}

function GardenCanvasInner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useCanvasSize(containerRef);
  const garden = useGardenStore((s) => s.garden);

  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Two rAFs guarantee the renderer has had a chance to paint at least one frame.
    requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
  }, []);

  // Subscribe so React re-renders when these change. The closures below
  // re-read on every paint, so the actual values flow through that path.
  useUiStore((s) => s.selectedIds);
  useUiStore((s) => s.labelMode);
  useUiStore((s) => s.labelFontSize);
  useUiStore((s) => s.plantIconScale);
  useUiStore((s) => s.debugOverlappingLabels);
  useUiStore((s) => s.renderLayerVisibility);
  useUiStore((s) => s.dragClashIds);
  useUiStore((s) => s.highlightOpacity);
  useUiStore((s) => s.showFootprintCircles);
  const dragPreview = useUiStore((s) => s.dragPreview);
  // Pulse → re-render layers while flashes are active.
  useHighlightTick();

  const [iconTick, setIconTick] = useState(0);
  useEffect(() => onIconLoad(() => setIconTick((t) => t + 1)), []);

  const adapter = useMemo(() => createGardenSceneAdapter(), []);
  const insertAdapter = useMemo(() => createInsertAdapter(), []);

  // Alt-click cycle memo for the select tool's `pickBest` seam (below). Tracks
  // the last (worldX, worldY) + hit-stack + index so repeated alt-clicks at the
  // same point advance one deeper through overlapping objects.
  const cyclePickMemoRef = useRef<{
    worldX: number;
    worldY: number;
    ids: string[];
    index: number;
  } | null>(null);

  // View state lives locally — the canvas owns its viewport. UI siblings
  // (StatusBar, ScaleIndicator, ReturnToGarden, useGardenOffscreen,
  // useViewMoving) read a write-only mirror in `useUiStore.gardenZoom/PanX/PanY`
  // that we keep in sync via `setGardenViewMirror` below. Outside actors
  // (Cmd+0 reset, StatusBar zoom buttons, ReturnToGarden) request changes by
  // setting `useUiStore.gardenViewRequest`; the effect below applies and
  // clears it. Tools (wheel-zoom, drag-pan, click-zoom) talk to the canvas
  // through Tool ctx (`ctx.view`/`ctx.setView`) and never read the store.
  // Internally we use kit's screen-space {zoom, panX, panY} representation
  // (matching the legacy uiStore shape) and convert to the kit's camera-coord
  // `View` ({x, y, scale}) at the boundary.
  const [zoom, setZoomState] = useState(0);
  const [panX, setPanXState] = useState(0);
  const [panY, setPanYState] = useState(0);

  // Mirror to a ref so non-React readers (the palette drop tool's document
  // pointer pipeline) can read the latest view without re-attaching listeners.
  const viewRef = useRef<View>({ x: 0, y: 0, scale: 1 });
  useEffect(() => {
    viewRef.current =
      zoom > 0 ? { x: -panX / zoom, y: -panY / zoom, scale: zoom } : { x: 0, y: 0, scale: 1 };
  }, [zoom, panX, panY]);

  const BASE_GARDEN_ZOOM = 64; // px/ft at "100%"

  // Mirror local view → ui store so sibling UI components can read it.
  useEffect(() => {
    if (zoom <= 0) return;
    useUiStore.getState().setGardenViewMirror(zoom, panX, panY);
    useUiStore.getState().setCanvasZoomPct(Math.round((zoom / BASE_GARDEN_ZOOM) * 100));
  }, [zoom, panX, panY]);

  // Initial fit. Re-runs only when width/height/garden bounds change AND we
  // haven't fit yet (or the canvas just got non-zero size).
  const didFitRef = useRef(false);
  useEffect(() => {
    if (didFitRef.current) return;
    if (width === 0 || height === 0) return;
    didFitRef.current = true;
    const fit = computeFitView(width, height, garden.widthFt, garden.lengthFt);
    setZoomState(clampZoom(fit.zoom));
    setPanXState(fit.panX);
    setPanYState(fit.panY);
  }, [width, height, garden.widthFt, garden.lengthFt]);

  // External view requests (Cmd+0 reset, StatusBar zoom buttons,
  // ReturnToGarden setPan). Subscribe imperatively so we react to every
  // request — even rapid ones that would coalesce in a render-cycle reader.
  useEffect(() => {
    const unsub = useUiStore.subscribe((state, prev) => {
      // Mode-specific garden requests (set-pan, set-zoom by absolute value, reset).
      const req = state.gardenViewRequest;
      if (req !== prev.gardenViewRequest && req) {
        if (req.kind === 'reset') {
          const w = containerRef.current?.clientWidth ?? width;
          const h = containerRef.current?.clientHeight ?? height;
          if (w > 0 && h > 0) {
            const fit = computeFitView(
              w,
              h,
              useGardenStore.getState().garden.widthFt,
              useGardenStore.getState().garden.lengthFt,
            );
            setZoomState(clampZoom(fit.zoom));
            setPanXState(fit.panX);
            setPanYState(fit.panY);
          }
        } else if (req.kind === 'set-zoom') {
          setZoomState(clampZoom(req.value));
        } else if (req.kind === 'set-pan') {
          setPanXState(req.x);
          setPanYState(req.y);
        }
        useUiStore.getState().setGardenViewRequest(null);
      }
      // Unified zoom request from StatusBar / keyboard.
      const zoomReq = state.canvasZoomRequest;
      if (zoomReq !== prev.canvasZoomRequest && zoomReq) {
        if (zoomReq === 'reset-fit') {
          const w = containerRef.current?.clientWidth ?? width;
          const h = containerRef.current?.clientHeight ?? height;
          if (w > 0 && h > 0) {
            const fit = computeFitView(
              w,
              h,
              useGardenStore.getState().garden.widthFt,
              useGardenStore.getState().garden.lengthFt,
            );
            setZoomState(clampZoom(fit.zoom));
            setPanXState(fit.panX);
            setPanYState(fit.panY);
          }
        } else {
          const factor = zoomReq === 'zoom-in' ? 1.25 : 0.8;
          setZoomState((z) => clampZoom(z * factor));
        }
        useUiStore.getState().setCanvasZoomRequest(null);
      }
    });
    return unsub;
  }, [width, height]);

  const gridCellSizeFt = useGardenStore((s) => s.garden.gridCellSizeFt);

  // Shared per-frame UI getter. Reads the stores at call time, so it has no
  // render-scoped deps and stays referentially stable — both the domain layer
  // factories AND the kit scene-slot painter (`createGardenDrawOne`) read from
  // this same getter so committed bodies and decorations agree on UI state.
  const getUi = useCallback<GetUi>(() => {
    const u = useUiStore.getState();
    // Per-id flash opacity — layers call `getHighlight(id)` per entity. The
    // highlight store already keys flashes/hovers by id; we just pass the
    // reader through so each layer can pulse independently.
    const getHighlight = (id: string) => useHighlightStore.getState().computeOpacity(id);
    // Surface the palette-drop drag putative so the conflict overlay can
    // include the ghost in its occupancy compute (red/yellow before commit).
    let dragPlantingGhost: { parentId: string; cultivarId: string; x: number; y: number } | null =
      null;
    if (u.dragPreview && u.dragPreview.kind === 'garden-palette-plant') {
      const put = u.dragPreview.putative as {
        parentId?: string;
        cultivarId?: string;
        x?: number;
        y?: number;
      };
      if (
        put?.parentId &&
        put.cultivarId &&
        typeof put.x === 'number' &&
        typeof put.y === 'number'
      ) {
        // putative.{x,y} are WORLD coords; the conflict overlay's resolveFootprint
        // expects parent-LOCAL plus parent.x/y as origin, so convert back here.
        const parent =
          useGardenStore.getState().garden.structures.find((s) => s.id === put.parentId) ??
          useGardenStore.getState().garden.zones.find((z) => z.id === put.parentId);
        if (parent) {
          dragPlantingGhost = {
            parentId: put.parentId,
            cultivarId: put.cultivarId,
            x: put.x - parent.x,
            y: put.y - parent.y,
          };
        }
      }
    }
    return {
      selectedIds: u.selectedIds,
      labelMode: u.labelMode,
      labelFontSize: u.labelFontSize,
      plantIconScale: u.plantIconScale,
      showFootprintCircles: u.showFootprintCircles,
      getHighlight,
      debugOverlappingLabels: u.debugOverlappingLabels,
      dragClashIds: u.dragClashIds,
      dragPlantingGhost,
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: iconTick/dragPreview/garden.* are intentional redraw triggers; the layer getters read latest state from the store at call time.
  const layers = useMemo(() => {
    const getStructures = () => useGardenStore.getState().garden.structures;
    const getZones = () => useGardenStore.getState().garden.zones;
    const getPlantings = () => useGardenStore.getState().garden.plantings;

    // Putative-drag preview layer — renders the palette → garden plant ghost
    // from `uiStore.dragPreview`. The move / resize / area-select ghosts render
    // through the kit dispatcher (`usePreviewGhostLayer` + the dispatcher
    // overlay), and the plot (rectangle) preview through the kit `insert`
    // action's own overlay, so the palette drop is the last eric-owned putative
    // drag registered here.
    const dragPreviewRegistry = {
      [createGardenPaletteDrag({ getEntry: () => null }).kind]: createGardenPaletteDrag({
        getEntry: () => null,
      }),
    };
    const baseList: RenderLayer<unknown>[] = [
      ...createZoneLayers(getZones, getUi),
      ...createStructureLayers(getStructures, getUi),
      ...createPlantingLayers(getPlantings, getZones, getStructures, getUi),
      createDragPreviewLayer(dragPreviewRegistry as never),
      createGroupOutlineLayer(getStructures, getUi),
      createStructureClashLayer(getStructures, getUi),
      ...createSystemLayers(),
    ];
    const debugLayers = createDebugLayers('garden', () => useGardenStore.getState().garden);
    if (isDebugEnabled('handles')) {
      debugLayers.push(
        createAllHandlesLayer({
          getStructures,
          getZones,
          getPlantings,
        }),
      );
    }
    // Publish the full set (base + debug) so the sidebar Render Layers panel
    // can list whatever's actually being drawn. Done before wrapping so the
    // registry sees the original alwaysOn/defaultVisible flags.
    setRegisteredLayers('garden', [...baseList, ...debugLayers]);
    const list = [
      ...wrapLayersWithVisibility(baseList, () => useUiStore.getState().renderLayerVisibility),
      ...debugLayers,
    ];
    const map: Record<string, { layer: RenderLayer<unknown>; before?: string }> = {};
    // Overlays that belong UNDER the plant icons but ABOVE the container bodies
    // (cell-grid slot dots, spacing-conflict rings, spacing rings) — matching
    // the pre-scene-slot stack where these drew below `planting-icons`. Plant
    // icons now render in the scene slot's top `plantings` sub-layer, which the
    // kit exposes as the addressable slot `scene:plantings`; slot these just
    // before it (so they sit above `scene:structures`/`scene:zones` bodies,
    // below the icons). Everything else (labels, measurements, walls, group/
    // clash highlights) defaults to the tail, above the icons.
    const BELOW_ICONS = new Set(['container-overlays', 'planting-conflicts', 'planting-spacing']);
    map.grid = {
      layer: createGridLayer({
        spacing: gridCellSizeFt,
        bounds: () => {
          const g = useGardenStore.getState().garden;
          return { x: 0, y: 0, width: g.widthFt, height: g.lengthFt };
        },
        style: {
          line: { paint: { color: 'rgba(0,0,0,0.18)' }, width: 1 },
        },
      }),
    };
    list.forEach((l) => {
      map[l.id] = BELOW_ICONS.has(l.id) ? { layer: l, before: 'scene:plantings' } : { layer: l };
    });
    return map;
    // iconTick is intentional — bumps when an icon bitmap finishes decoding
    // so the layers map gets a fresh reference and weasel re-paints. The
    // layer closures read getIconBitmap() at draw time; without a new ref,
    // weasel skips the paint and the icon never appears.
    // dragPreview is intentional — when a palette drop ghost is hovering, the
    // conflict overlay needs to recompute, which means weasel needs to see a
    // new layers ref. Without this dep, hovering doesn't update the overlay.
    //
    // garden.plantings/structures/zones are intentional — when a planting
    // moves within its container (or any structure/zone changes), the store
    // mutates these arrays. Without including them, the layers ref stays
    // stable and weasel never repaints, even though the data is fresh.
    // Cross-container moves "just worked" because the parentId-change path
    // bumps other state; same-container moves only changed x/y.
  }, [
    getUi,
    gridCellSizeFt,
    iconTick,
    dragPreview,
    garden.plantings,
    garden.structures,
    garden.zones,
  ]);

  // Build the kit camera-coord `View` from local screen-space (zoom, panX, panY).
  // Pre-fit (zoom===0) we render with a fallback margin-fit so the very first
  // paint isn't blank; once the fit effect above runs (next frame) the real
  // view takes over.
  const view = useMemo<View>(() => {
    if (width === 0 || height === 0) return { x: 0, y: 0, scale: 1 };
    if (zoom > 0) {
      return { x: -panX / zoom, y: -panY / zoom, scale: zoom };
    }
    const margin = 40;
    const sx = (width - margin * 2) / Math.max(1, garden.widthFt);
    const sy = (height - margin * 2) / Math.max(1, garden.lengthFt);
    const scale = Math.min(sx, sy);
    const usedW = garden.widthFt * scale;
    const usedH = garden.lengthFt * scale;
    const offX = (width - usedW) / 2;
    const offY = (height - usedH) / 2;
    return { x: -offX / scale, y: -offY / scale, scale };
  }, [width, height, garden.widthFt, garden.lengthFt, zoom, panX, panY]);

  // Commit a view (eric's scalar form) into the local zoom/pan state, clamped.
  // Stable identity — the state setters are stable — so non-React callers (the
  // right-drag pan pipeline) can hold onto it across renders.
  const applyView = useCallback((next: View) => {
    const clamped = clampZoom(next.scale);
    setZoomState(clamped);
    setPanXState(-next.x * clamped);
    setPanYState(-next.y * clamped);
  }, []);

  const handleViewChange = (kitNext: Parameters<typeof fromKitView>[0]) => {
    applyView(fromKitView(kitNext));
  };

  // --- Tools ---
  // The kit gesture dispatcher owns move / resize / area-select / clone through
  // its internal `select` tool (configured via `selectTool` on <SceneCanvas>).
  // Eric keeps its custom pan / zoom / insert tools, plus a focused
  // force-marquee tool (select-area) and an ambient click tool (clear +
  // group-promote). Alt-click stack cycling lives in the select tool's
  // `pickBest` seam (below). Active-slot switching is driven from `viewMode`.
  const leftDragPan = useEricLeftDragPanTool();
  const clickZoom = useEricClickZoomTool();
  const getViewScale = useCallback(() => viewRef.current.scale, []);
  const clickTool = useEricCanvasClickTool(getViewScale);
  const selectAreaTool = useEricSelectAreaTool();
  // Plot (rectangle) drag. The kit's own rect tool: a single `drag` binding onto
  // the `insert` action, which tracks the live bounds, paints the preview, and
  // commits through the `insert` dep — eric's `GardenInsertDep` below, which
  // builds a real `Structure`/`Zone` from the armed `plottingTool`.
  //
  // Eric's bespoke PLOT_DRAG_KIND preview is gone with it: `useInsertTool`
  // ignored the adapter/options handed to it, so eric's `behaviors` mirror and
  // the transparent `overlayStyle` that suppressed the kit's marquee were both
  // dead code — the kit overlay has been drawing this rect all along. The
  // armed `plottingTool` likewise stays armed after a plot (`onGestureEnd` was
  // dead too); one-shot disarm is a behavior change, tracked in docs/TODO.md.
  const insertTool = useRectTool();
  // Right-mouse-drag pan. Not a kit tool: the gesture dispatcher only routes the
  // primary button, leaving secondary buttons to the consumer.
  const getView = useCallback(() => viewRef.current, []);
  useRightDragPan(containerRef, getView, applyView);
  // Palette → garden drop tool (non-claiming pseudo-tool). Subscribes to
  // `palettePointerPayload`, owns ghost + threshold drag + commit.
  useGardenPaletteDropTool({ containerRef, viewRef });

  // Domain move behaviors threaded into the kit `move` action via the internal
  // select tool's binding `opts.behaviors`. Typed against eric's `ScenePose`
  // (position-only); the kit drives them with the scene's rect `GardenPose`,
  // which is a structural superset, so the cast is sound (behaviors only read
  // x/y + `node.data`).
  const snap = useMemo(() => ({ sources: [structureZoneGridSnap(adapter)] }), [adapter]);

  const selectTool = useMemo(
    () => ({
      move: {
        behaviors: [
          // clamp → clash: clamp is the last word on position; clash needs the
          // post-snap/clamp pose. Planting behaviors are kind-narrowed.
          clampStructureZoneToGardenBounds(adapter),
          detectStructureClash(adapter),
          // Slot-bound guard: defers in-bounds planting drops to the kit's
          // container layout (the `layout` dep → commitDrop); only snaps back a
          // release in free space.
          requirePlantingDrop(adapter),
        ] as unknown as MoveBehavior<unknown>[],
        // Dragging one grouped structure moves all `groupId` siblings. Selection
        // in the UI store stays narrow so the kit's single-target resize
        // affordance is preserved on the clicked member.
        expandIds: (ids: string[]) =>
          expandToGroups(ids, useGardenStore.getState().garden.structures),
      },
      // Plantings have a fixed cultivar footprint, not a user-editable rect, so
      // they aren't resizable. The kit folds this predicate over the selection
      // into the `selection.resize-handles` visibility rule, which gates both
      // the painted handles AND the resize affordance (visible == hittable).
      // Structures/zones (everything not a planting) keep their handles.
      resize: {
        resizable: (id: string) =>
          !useGardenStore.getState().garden.plantings.some((p) => p.id === id),
      },
      // Garden structures/zones don't rotate — disable rotation entirely
      // (drops the rotate action + hides the rotation-handle chrome).
      rotate: false as const,
      // Alt-aware body pick. The kit select tool claims every pointerdown
      // before any ambient tool runs (its `pointerDownBody` classifier always
      // returns `begin`; the dispatcher gives the whole gesture to the first
      // claimer, and active precedes ambient). An ambient cycle tool could
      // therefore never see the pointerdown, so alt-click stack cycling lives
      // HERE, in the select tool's `pickBest` seam.
      //   - no alt → topmost hit (eric's `hitAll` is ordered top-first +
      //     footprint-precise — the same id the kit default would resolve).
      //   - alt → cycle: first alt-click at a point selects the top; each
      //     subsequent alt-click at the same point advances one deeper, wrapping.
      pickBest: (
        { x: worldX, y: worldY }: { x: number; y: number },
        alt: boolean,
      ): string | null => {
        const ids = adapter.hitAll(worldX, worldY).map((n) => n.id);
        if (ids.length === 0) return null;
        if (!alt) return ids[0];
        const memo = cyclePickMemoRef.current;
        const same =
          memo != null &&
          Math.abs(memo.worldX - worldX) < 0.001 &&
          Math.abs(memo.worldY - worldY) < 0.001 &&
          memo.ids.length === ids.length &&
          memo.ids.every((v, i) => v === ids[i]);
        const nextIndex = same ? (memo!.index + 1) % ids.length : 0;
        cyclePickMemoRef.current = { worldX, worldY, ids, index: nextIndex };
        return ids[nextIndex];
      },
    }),
    [adapter],
  );

  // Hit-test + bounds overrides for the kit select tool. `pickEvery` returns
  // eric's domain hit stack (plantings over structures over zones, footprint-
  // precise); the kit collapses parent/child overlap via `pickTopMostHit`.
  const geometry = useMemo(
    () => ({
      pickEvery: (world: { x: number; y: number }): string[] =>
        adapter.hitAll(world.x, world.y).map((n) => n.id),
      boundsOf: (id: string) => {
        const b = adapter.getBounds(id);
        return b ? { x: b.x, y: b.y, width: b.width, height: b.length } : null;
      },
    }),
    [adapter],
  );

  const viewMode = useUiStore((s) => s.viewMode);
  const plottingTool = useUiStore((s) => s.plottingTool);

  // Active dispatcher tool id, driven by viewMode + plotting state.
  const activeToolId = useMemo(() => {
    if (plottingTool) return insertTool.id;
    switch (viewMode) {
      case 'pan':
        return leftDragPan.id;
      case 'select':
      case 'draw':
        return 'select';
      case 'select-area':
        return selectAreaTool.id;
      case 'zoom':
        return clickZoom.id;
      default:
        return 'select';
    }
  }, [viewMode, plottingTool, leftDragPan.id, selectAreaTool.id, insertTool.id, clickZoom.id]);

  // The active mode follows the UI store (see GARDEN_MODES).
  const modes = useMemo(
    () => createModeRegistry({ modes: GARDEN_MODES, initial: gardenModeId(useUiStore.getState()) }),
    [],
  );
  useEffect(
    () =>
      useUiStore.subscribe((ui) => {
        const id = gardenModeId(ui);
        if (modes.current().id !== id) modes.setMode(id);
      }),
    [modes],
  );

  // Capture the internal `ToolsApi` SceneCanvas synthesizes so we can drive the
  // active slot from `viewMode`. Child (SceneCanvas) effects run before this
  // parent effect, so the ref is populated before the first switch.
  const toolsApiRef = useRef<ToolsApi | null>(null);
  const handleToolsCreated = useCallback((t: ToolsApi) => {
    toolsApiRef.current = t;
  }, []);
  useEffect(() => {
    toolsApiRef.current?.setActive(activeToolId);
  }, [activeToolId]);

  // Eric tools added alongside the internal select tool. Foreground (switchable)
  // tools go in the patch-form `tools` record; always-on tools (right-drag pan,
  // canvas click) go in `ambient`. Wheel zoom is the kit's `viewport.zoom`
  // action (plain-wheel mode) — see the `viewport` prop below.
  const toolsPatch = useMemo<Record<string, AnyTool>>(
    () => ({
      [leftDragPan.id]: leftDragPan,
      [clickZoom.id]: clickZoom,
      [insertTool.id]: insertTool,
      [selectAreaTool.id]: selectAreaTool,
    }),
    [leftDragPan, clickZoom, insertTool, selectAreaTool],
  );
  const ambient = useMemo<AnyTool[]>(() => [clickTool], [clickTool]);

  // The live kit Scene is the spatial store of record (identity-stable across
  // in-place loadState restores), so capture it once for <SceneCanvas>.
  const scene = useMemo(() => useGardenStore.getState().getScene(), []);
  const selectionApi = useGardenSelectionApi();

  // Action overrides. `clearSelection` + group-promote live in
  // `eric-canvas-click`, so disable the kit default. `clone` is eric's custom
  // alt-drag-clone action (`createGardenCloneAction`): the kit select tool's
  // alt-body-drag binding routes here, but the commit goes through eric's
  // domain path (group-expansion + planting parent-from-drop + applyOps undo)
  // instead of the kit cloneAction's verbatim scene-node copy. `duplicate`
  // (keyboard Cmd+D) stays disabled — out of scope.
  const cloneAction = useMemo(
    () => createGardenCloneAction(insertAdapter, scene),
    [insertAdapter, scene],
  );
  const canvasClickAction = useMemo(() => createCanvasClickAction(adapter), [adapter]);
  const clickZoomAction = useMemo(
    () => createClickZoomAction({ min: GARDEN_MIN_ZOOM, max: GARDEN_MAX_ZOOM }),
    [],
  );
  const actions = useMemo<ActionsProp>(
    () =>
      ({
        clearSelection: null,
        clone: cloneAction,
        duplicate: null,
        // Eric-owned actions the tools above bind to. The `actions` prop takes
        // any id, so consumer actions register through the same seam as kit
        // overrides.
        [canvasClickAction.id]: canvasClickAction,
        [clickZoomAction.id]: clickZoomAction,
      }) as ActionsProp,
    [cloneAction, canvasClickAction, clickZoomAction],
  );

  // Kit scene-slot painter. The kit drives the slot from the live `GardenScene`,
  // handing `drawOne` a kit `Node<GardenNodeData,…>` + the scene's geometry-only
  // `GardenPose`. `createGardenDrawOne` is written against eric's own `SceneNode`
  // (full domain entity in `.data`) + a WORLD `ScenePose`, so we bridge by id:
  // `adapter.getNode(id)` rebuilds the full entity.
  const sceneCanvasLayers = useMemo(() => {
    const ericDrawOne = createGardenDrawOne(getUi);
    const drawOne = (
      kitNode: { id: string },
      kitPose: { x: number; y: number } | null,
      kitView: Parameters<typeof ericDrawOne>[2],
    ): ReturnType<typeof ericDrawOne> => {
      const node = adapter.getNode(kitNode.id);
      if (!node) return [];
      // The kit composes parent frames before calling drawOne, so kitPose is
      // already world (including the live preview pose during a drag).
      const world: ScenePose =
        kitPose == null ? adapter.getPose(node.id) : { x: kitPose.x, y: kitPose.y };
      return ericDrawOne(node, world, kitView);
    };
    return {
      scene: { drawOne: drawOne as never },
      // The kit's default selection-overlay `poseById` reads `adapter.getPose`,
      // which is the scene pose — parent-LOCAL for contained items (plantings,
      // nested structures), so the chrome would draw near the world origin.
      // Supply the WORLD AABB (same source as `geometry.boundsOf`) so the
      // selection box + handles sit on the entity at its real location.
      selectionOverlay: { poseById: (id: string) => geometry.boundsOf(id) as never },
      ...layers,
    };
  }, [adapter, getUi, layers, geometry]);

  return (
    <div
      ref={containerRef}
      data-canvas-container
      data-canvas-ready={ready ? 'true' : 'false'}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: garden.groundColor,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {width > 0 && height > 0 && (
        <SceneCanvas
          scene={scene}
          width={width}
          height={height}
          view={toKitView(view)}
          onViewChange={handleViewChange}
          layers={sceneCanvasLayers}
          features={GARDEN_FEATURES}
          defaultTools={['select']}
          selectTool={selectTool as never}
          snap={snap}
          geometry={geometry}
          tools={toolsPatch}
          ambient={ambient}
          actions={actions}
          modes={modes}
          // Wheel zoom is the kit's `viewport.zoom` action in plain-wheel mode
          // (bare wheel = zoom, anchored at cursor) with eric's px-per-foot
          // scale clamp; the kit default is Cmd-wheel + a 0.1–8 clamp. The clamp
          // matches `clampZoom` — `handleViewChange` re-clamps every committed
          // view, so a wider clamp here would just be dead config.
          // Wheel PAN stays off — eric pans via its drag tools / StatusBar, and
          // a plain-wheel pan would compete with plain-wheel zoom.
          viewport={{
            pan: false,
            zoom: { wheel: 'plain', min: GARDEN_MIN_ZOOM, max: GARDEN_MAX_ZOOM },
          }}
          onToolsCreated={handleToolsCreated}
          selection={selectionApi}
          enableGestureDispatcher={true}
          enableKeybindings={false}
        >
          <GardenHistoryBridge scene={scene} />
          <GardenAreaSelectDep adapter={adapter} selection={selectionApi} />
          <GardenInsertDep insertAdapter={insertAdapter} />
        </SceneCanvas>
      )}
    </div>
  );
}
