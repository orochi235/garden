import type { Action, Tool } from '@weasel-js/core';
import { defineTool } from '@weasel-js/core/routing';
import { useMemo } from 'react';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { expandToGroups } from '../../utils/groups';
import type { GardenSceneAdapter } from '../adapters/gardenScene';

/** Pixel tolerance for hitting the implicit-outline edge of a group sibling. */
const OUTLINE_EDGE_HIT_PX = 6;

/**
 * True if (worldX, worldY) lies on the rectangular/elliptical AABB edge of
 * `obj` within `tolWorld` units but NOT inside the body. Used for "click the
 * implicit group-sibling outline to promote selection to the whole group."
 * Ported verbatim from the deleted `useEricSelectTool`.
 */
function hitOutlineEdge(
  obj: { x: number; y: number; width: number; length: number; shape?: string },
  worldX: number,
  worldY: number,
  tolWorld: number,
): boolean {
  if (obj.shape === 'circle') {
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.length / 2;
    const rx = obj.width / 2;
    const ry = obj.length / 2;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (worldX - cx) / rx;
    const dy = (worldY - cy) / ry;
    const d = Math.hypot(dx, dy);
    const meanR = (rx + ry) / 2;
    const tolNorm = tolWorld / Math.max(0.0001, meanR);
    if (d >= 1 - tolNorm && d <= 1 + tolNorm) {
      return d >= 1 - tolNorm * 0.25;
    }
    return false;
  }
  const minX = obj.x;
  const minY = obj.y;
  const maxX = obj.x + obj.width;
  const maxY = obj.y + obj.length;
  if (worldX < minX - tolWorld || worldX > maxX + tolWorld) return false;
  if (worldY < minY - tolWorld || worldY > maxY + tolWorld) return false;
  const insideBody =
    worldX > minX + tolWorld &&
    worldX < maxX - tolWorld &&
    worldY > minY + tolWorld &&
    worldY < maxY - tolWorld;
  return !insideBody;
}

/** Action id for eric's empty-click semantics (group-promote / clear). */
export const CANVAS_CLICK_ACTION_ID = 'eric.canvasClick';

/**
 * The click semantics the kit's select tool doesn't cover:
 *
 *  - **group-outline-edge click-to-promote** — clicking the implicit outline of
 *    a group sibling promotes the selection to the whole group.
 *  - **clear-on-empty-click** — a plain (no-shift) click on empty space clears
 *    the selection. The kit's own `clearSelection` action stays disabled by the
 *    consumer so this one action owns both, with no promote/clear race.
 *
 * Body clicks never reach here: the tool binds `target: 'empty'`, and the kit
 * select tool already selects the hit body on pointerdown.
 *
 * Weasel 0.7 turned tools into pure binding tables, which is what makes this an
 * action at all — and it retires the `clickFallback` prop this used to need.
 * The dispatcher never fired an ambient tool's imperative `pointer.onClick`, so
 * eric had to hand the same tool to a dedicated fallback slot; an ambient
 * tool's *bindings* are consulted normally, so the slot is gone from the kit
 * and the workaround with it.
 */
export function createCanvasClickAction(adapter: GardenSceneAdapter): Action {
  return {
    id: CANVAS_CLICK_ACTION_ID,
    label: 'Canvas click',
    // Selection changes are not undoable in eric, so this needs no deps beyond
    // the stores it reads directly.
    invoker: {
      timing: 'immediate',
      run: (_deps, params) => {
        const worldX = params?.worldX as number | undefined;
        const worldY = params?.worldY as number | undefined;
        const scale = params?.viewScale as number | undefined;
        if (worldX === undefined || worldY === undefined) return;
        // Belt-and-braces: `target: 'empty'` should already have filtered body
        // clicks, but the classifier and eric's domain hit-test can disagree at
        // a footprint edge, and a body click must never clear the selection.
        if (adapter.hitTest(worldX, worldY)) return;

        const ui = useUiStore.getState();
        const sel = ui.selectedIds;
        const structures = useGardenStore.getState().garden.structures;
        const shift = (params?.mods as { shift?: boolean } | undefined)?.shift === true;

        // Group-outline-edge click-to-promote: a partial group selection + a
        // click on a sibling's implicit outline promotes to the whole group.
        if (sel.length > 0) {
          const expanded = expandToGroups(sel, structures);
          if (expanded.length > sel.length) {
            const explicitSet = new Set(sel);
            const tolWorld = OUTLINE_EDGE_HIT_PX / Math.max(0.0001, scale ?? 1);
            const byId = new Map(structures.map((s) => [s.id, s] as const));
            for (const id of expanded) {
              if (explicitSet.has(id)) continue;
              const s = byId.get(id);
              if (s && hitOutlineEdge(s, worldX, worldY, tolWorld)) {
                ui.setSelection(expanded);
                return;
              }
            }
          }
        }

        // Empty click (no outline hit): clear unless shift-extending.
        if (!shift) ui.clearSelection();
      },
    },
  };
}

/**
 * Ambient tool carrying the binding that reaches `createCanvasClickAction`.
 *
 * `viewScale` rides on the binding params as a thunk so the outline-edge
 * tolerance (6 screen px) can be converted to world units at dispatch time —
 * an immediate invoker gets no view of its own.
 */
export function useEricCanvasClickTool(getViewScale: () => number): Tool<{ kind: 'idle' }> {
  return useMemo(
    () =>
      defineTool<{ kind: 'idle' }>({
        id: 'eric-canvas-click',
        initScratch: () => ({ kind: 'idle' }),
        bindings: [
          {
            spec: { kind: 'click', target: 'empty' },
            actionId: CANVAS_CLICK_ACTION_ID,
            opts: { params: () => ({ viewScale: getViewScale() }) },
          },
        ],
      }),
    [getViewScale],
  );
}
