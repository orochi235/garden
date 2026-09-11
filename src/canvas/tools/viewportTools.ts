import { type Action, type Tool, zoomAt } from '@weasel-js/core';
import { defineTool } from '@weasel-js/core/routing';
import { type RefObject, useEffect, useMemo } from 'react';
import type { View } from '../layers/worldLayerData';

/** Eric's zoom is pixels-per-foot (garden) / pixels-per-inch (nursery); legacy
 *  fit values land well outside the kit's own 0.1–8 default clamp. */
export const ERIC_MIN_ZOOM = 5;
export const ERIC_MAX_ZOOM = 500;

export interface EricClickZoomOpts {
  min?: number;
  max?: number;
  /** Multiplicative factor per click. Default 1.5. Shift inverts to 1/factor. */
  factor?: number;
}

/** Action id for eric's click-to-zoom. Registered per-canvas via the
 *  `<SceneCanvas actions>` prop; the click-zoom tool binds a plain click to it. */
export const CLICK_ZOOM_ACTION_ID = 'eric.clickZoom';

/**
 * Click-to-zoom as a kit Action.
 *
 * Weasel 0.7 retired the imperative `Tool.pointer` handlers this used to live
 * in — a tool is now nothing but `bindings` pointing at registered actions —
 * so the zoom math moved here and `useEricClickZoomTool` is just the binding.
 *
 * An immediate invoker gets `(deps, params)` — no `InvocationCtx` — so the
 * click point arrives as the dispatcher-injected `params.worldX/worldY` and the
 * shift state as `params.mods`. The canvas-local anchor `zoomAt` wants is then
 * derived from the world point: `screen = (world - view) * scale`, which keeps
 * the world point under the cursor pinned across the zoom.
 */
export function createClickZoomAction(opts: EricClickZoomOpts = {}): Action {
  const min = opts.min ?? ERIC_MIN_ZOOM;
  const max = opts.max ?? ERIC_MAX_ZOOM;
  const factor = opts.factor ?? 1.5;
  return {
    id: CLICK_ZOOM_ACTION_ID,
    label: 'Click to zoom',
    group: 'viewport',
    requires: ['view'],
    invoker: {
      timing: 'immediate',
      run: (deps, params) => {
        const view = deps.view as
          | {
              get(): { x: number; y: number; scale: { x: number; y: number } };
              set(v: { x: number; y: number; scale: { x: number; y: number } }): void;
            }
          | undefined;
        const worldX = params?.worldX as number | undefined;
        const worldY = params?.worldY as number | undefined;
        if (!view || worldX === undefined || worldY === undefined) return;
        const v = view.get();
        const anchor = { x: (worldX - v.x) * v.scale.x, y: (worldY - v.y) * v.scale.y };
        const shift = (params?.mods as { shift?: boolean } | undefined)?.shift === true;
        view.set(zoomAt(v, anchor, shift ? 1 / factor : factor, { min, max }));
      },
    },
  };
}

/**
 * Click-to-zoom tool — the active tool while `viewMode === 'zoom'`. Plain
 * left-click zooms in around the click point; Shift+click zooms out.
 *
 * The cursor flips live with the shift state: the dispatcher re-resolves
 * `cursor` on every modifier change.
 */
export function useEricClickZoomTool(): Tool<null> {
  return useMemo(
    () =>
      defineTool<null>({
        id: 'eric-click-zoom',
        cursor: (ctx) => (ctx.modifiers.shift ? 'zoom-out' : 'zoom-in'),
        initScratch: () => null,
        bindings: [{ spec: { kind: 'click' }, actionId: CLICK_ZOOM_ACTION_ID }],
      }),
    [],
  );
}

/**
 * Left-drag-to-pan tool — the active tool while `viewMode === 'pan'`.
 *
 * Binds every drag to the kit's standard `viewport.dragPan` action, which does
 * the screen-delta → world-delta math eric used to hand-roll (and does it off
 * `drag.screenDelta`, which stays stable as the view moves under the cursor —
 * the hand-rolled version recomputed from a captured start view, same result).
 */
export function useEricLeftDragPanTool(): Tool<null> {
  return useMemo(
    () =>
      defineTool<null>({
        id: 'eric-left-drag-pan',
        cursor: 'grab',
        initScratch: () => null,
        bindings: [{ spec: { kind: 'drag' }, actionId: 'viewport.dragPan' }],
      }),
    [],
  );
}

/**
 * Right-mouse-drag pans the viewport, in every mode.
 *
 * This is NOT a kit tool: weasel's gesture dispatcher only routes the primary
 * button (`useGestureDispatcher` returns early on `button !== 0`), deliberately
 * leaving secondary/middle buttons to the consumer — so there is no binding
 * that could reach a pan action from a right-drag. It is a plain DOM pointer
 * pipeline on the canvas container instead.
 *
 * `getView`/`setView` are eric's scalar `View`; the container is expected to
 * already suppress `contextmenu` (both canvases do).
 */
export function useRightDragPan(
  containerRef: RefObject<HTMLElement | null>,
  getView: () => View,
  setView: (v: View) => void,
): void {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let pointerId: number | null = null;
    let startClient = { x: 0, y: 0 };
    let startView: View = { x: 0, y: 0, scale: 1 };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();
      pointerId = e.pointerId;
      startClient = { x: e.clientX, y: e.clientY };
      startView = getView();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // best-effort — jsdom and some embedded browsers lack pointer capture
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const dx = e.clientX - startClient.x;
      const dy = e.clientY - startClient.y;
      setView({
        x: startView.x - dx / startView.scale,
        y: startView.y - dy / startView.scale,
        scale: startView.scale,
      });
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      pointerId = null;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // released already / never captured
      }
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  }, [containerRef, getView, setView]);
}
