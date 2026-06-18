import { defineTool, type Tool } from '@orochi235/weasel';
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

/**
 * Ambient tool owning the click semantics the kit's select tool doesn't cover,
 * re-homed (Phase 7 step 3) from the deleted `useEricSelectTool`:
 *
 *  - **group-outline-edge click-to-promote** — clicking the implicit outline of
 *    a group sibling promotes the selection to the whole group.
 *  - **clear-on-empty-click** — a plain (no-shift) click on empty space clears
 *    the selection. (The kit's `clearSelection` action is disabled by the
 *    consumer so this tool owns it, avoiding a promote/clear race.)
 *  - **Escape** clears the selection.
 *
 * Body clicks fall through (`'pass'`): the kit select tool already selects the
 * hit body on pointerdown.
 */
export function useEricCanvasClickTool(adapter: GardenSceneAdapter): Tool<{ kind: 'idle' }> {
  return useMemo(
    () =>
      defineTool<{ kind: 'idle' }>({
        id: 'eric-canvas-click',
        initScratch: () => ({ kind: 'idle' }),
        pointer: {
          onClick: (_e, ctx) => {
            // A body hit is owned by the kit select tool (selects on pointerdown).
            if (adapter.hitTest(ctx.worldX, ctx.worldY)) return 'pass';

            const ui = useUiStore.getState();
            const sel = ui.selectedIds;
            const structures = useGardenStore.getState().garden.structures;

            // Group-outline-edge click-to-promote: a partial group selection +
            // a click on a sibling's implicit outline promotes to the group.
            if (sel.length > 0) {
              const expanded = expandToGroups(sel, structures);
              if (expanded.length > sel.length) {
                const explicitSet = new Set(sel);
                const tolWorld = OUTLINE_EDGE_HIT_PX / Math.max(0.0001, ctx.view.scale.x);
                const byId = new Map(structures.map((s) => [s.id, s] as const));
                for (const id of expanded) {
                  if (explicitSet.has(id)) continue;
                  const s = byId.get(id);
                  if (s && hitOutlineEdge(s, ctx.worldX, ctx.worldY, tolWorld)) {
                    ui.setSelection(expanded);
                    return 'claim';
                  }
                }
              }
            }

            // Empty click (no outline hit): clear unless shift-extending.
            if (!ctx.modifiers.shift) {
              ui.clearSelection();
              return 'claim';
            }
            return 'pass';
          },
        },
        keyboard: {
          onDown: (e, _ctx) => {
            if (e.key === 'Escape') {
              useUiStore.getState().clearSelection();
              return 'claim';
            }
            return 'pass';
          },
        },
      }),
    [adapter],
  );
}
