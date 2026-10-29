import {
  type Action,
  defineTool,
  type ImmediateParams,
  type RenderLayer,
  type Tool,
} from '@weasel-js/core';
import { useMemo } from 'react';
import {
  clickFirstHandling,
  type GesturePoint,
  type NurseryClickGesture,
  type NurseryDragGesture,
  type NurseryDragHandle,
  startFirstClaiming,
} from './nurseryGestures';

export const NURSERY_DRAG_ACTION_ID = 'eric.nursery.drag';
export const NURSERY_CLICK_ACTION_ID = 'eric.nursery.click';

function pointFrom(ctx: {
  world: { x: number; y: number };
  modifiers: { shift: boolean; alt: boolean };
}): GesturePoint {
  return {
    worldX: ctx.world.x,
    worldY: ctx.world.y,
    shift: ctx.modifiers.shift,
    alt: ctx.modifiers.alt,
  };
}

/**
 * The one ongoing action every nursery drag flows through.
 *
 * `gestures` are tried in order and the first to claim owns the drag — the
 * explicit form of the claim ordering the retired tool-walking dispatcher used
 * to give the nursery for free (active move tool first, then the ambient
 * marquee / sow / fill chain). Returning an empty handle when nothing claims
 * lets the dispatcher fall through to a lower-priority binding.
 */
export function createNurseryDragAction(gestures: readonly NurseryDragGesture[]): Action {
  return {
    id: NURSERY_DRAG_ACTION_ID,
    label: 'Nursery drag',
    invoker: {
      timing: 'ongoing',
      start(ctx) {
        const handle: NurseryDragHandle | null = startFirstClaiming(gestures, pointFrom(ctx));
        if (!handle) return {};
        return {
          onMove(moveCtx) {
            handle.move(pointFrom(moveCtx));
          },
          onEnd(endCtx, reason) {
            if (reason === 'cancel') handle.cancel();
            else handle.end(pointFrom(endCtx));
          },
        };
      },
    },
  };
}

/**
 * The one immediate action every nursery click flows through. Same ordering
 * contract as the drag router: first gesture to handle it wins.
 *
 * An immediate invoker gets no `InvocationCtx`, so the click point arrives as
 * the dispatcher-injected `params.world` / `mods`.
 */
export function createNurseryClickAction(gestures: readonly NurseryClickGesture[]): Action {
  return {
    id: NURSERY_CLICK_ACTION_ID,
    label: 'Nursery click',
    invoker: {
      timing: 'immediate',
      run: (_deps, params) => {
        const { world, mods } = (params ?? {}) as ImmediateParams;
        if (!world) return;
        clickFirstHandling(gestures, {
          worldX: world.x,
          worldY: world.y,
          shift: mods?.shift === true,
          alt: mods?.alt === true,
        });
      },
    },
  };
}

/**
 * The nursery's active tool: one drag binding and one click binding onto the
 * router actions above, plus the seedling-move gutter overlay.
 *
 * Everything the nursery does with the pointer hangs off these two bindings, so
 * there is exactly one place where gesture priority is decided (the router's
 * gesture order) instead of an ordering that emerged from tool-slot walking.
 */
export function useNurseryTool(overlay: RenderLayer<unknown>): Tool {
  return useMemo(
    () =>
      defineTool({
        id: 'seed-nursery',
        cursor: 'default',
        overlay,
        bindings: [
          { spec: { kind: 'drag' }, actionId: NURSERY_DRAG_ACTION_ID },
          { spec: { kind: 'click' }, actionId: NURSERY_CLICK_ACTION_ID },
        ],
      }),
    [overlay],
  );
}
