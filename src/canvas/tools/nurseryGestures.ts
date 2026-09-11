/**
 * Kit-agnostic gesture contracts for the nursery canvas.
 *
 * Weasel 0.7 retired imperative `Tool.pointer` / `Tool.drag` handlers: a tool
 * is now a table of `bindings` pointing at registered actions, and the
 * dispatcher no longer walks a chain of tools asking each to `'claim'` or
 * `'pass'` a pointerdown. The nursery leaned on that walk — move claimed a
 * press on a seedling, fill claimed a shift-press on a cell, marquee took
 * whatever was left.
 *
 * That negotiation lives here instead, as plain domain objects with no kit
 * types in sight. `nurseryDragRouter` tries each gesture in priority order and
 * runs the first that claims; `createNurseryDragAction` wraps the router in the
 * one ongoing Action the nursery tool binds its single `drag` spec to. Ordering
 * is explicit rather than emergent from binding specificity, which is what the
 * old claim order actually was.
 */

/** World-space point + modifier state at a moment in a gesture. */
export interface GesturePoint {
  worldX: number;
  worldY: number;
  shift: boolean;
  alt: boolean;
}

/** A live drag: the gesture claimed the press and is now tracking it. */
export interface NurseryDragHandle {
  move(p: GesturePoint): void;
  /** Commit. Called on pointer release. */
  end(p: GesturePoint): void;
  /** Abandon without committing (Escape, pointercancel). */
  cancel(): void;
}

/**
 * A nursery drag gesture. `start` is the claim point: return a handle to take
 * the drag, or `null` to decline and let the next gesture try — the direct
 * replacement for the old `pointer.onDown` returning `'claim' | 'pass'`.
 */
export interface NurseryDragGesture {
  id: string;
  start(p: GesturePoint): NurseryDragHandle | null;
}

/**
 * A nursery click gesture. Returns `true` when it handled the click, `false`
 * to fall through to the next one.
 */
export interface NurseryClickGesture {
  id: string;
  click(p: GesturePoint): boolean;
}

/** Run `gestures` in order; the first to claim owns the drag. */
export function startFirstClaiming(
  gestures: readonly NurseryDragGesture[],
  p: GesturePoint,
): NurseryDragHandle | null {
  for (const g of gestures) {
    const handle = g.start(p);
    if (handle) return handle;
  }
  return null;
}

/** Run `gestures` in order; the first to handle the click wins. */
export function clickFirstHandling(
  gestures: readonly NurseryClickGesture[],
  p: GesturePoint,
): boolean {
  for (const g of gestures) {
    if (g.click(p)) return true;
  }
  return false;
}
