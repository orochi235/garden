import type { Op } from '../ops/types';
import type { MoveAdapter, SnapTarget } from '../adapters/types';

export interface ModifierState {
  alt: boolean;
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
}

export interface PointerState {
  worldX: number;
  worldY: number;
  clientX: number;
  clientY: number;
}

/**
 * Per-gesture context passed to behaviors. `current` is the running pose
 * map; behaviors mutate proposed poses by returning new TPose values from
 * onMove. `scratch` is per-gesture key/value storage that resets at the
 * next gesture start.
 */
export interface GestureContext<TPose> {
  draggedIds: string[];
  origin: Map<string, TPose>;
  current: Map<string, TPose>;
  snap: SnapTarget<TPose> | null;
  modifiers: ModifierState;
  pointer: PointerState;
  adapter: MoveAdapter<{ id: string; }, TPose>;
  scratch: Record<string, unknown>;
}

export interface BehaviorMoveResult<TPose> {
  pose?: TPose;
  snap?: SnapTarget<TPose> | null;
}

export interface MoveBehavior<TPose> {
  /** Called once at gesture start. */
  onStart?(ctx: GestureContext<TPose>): void;

  /**
   * Called on every pointermove past the threshold. Receives the proposed
   * pose (after earlier behaviors). Return `{ pose }` to override, `{ snap }`
   * to set snap state, both, or void to no-op.
   */
  onMove?(
    ctx: GestureContext<TPose>,
    proposed: TPose,
  ): BehaviorMoveResult<TPose> | void;

  /**
   * Called at gesture end. First non-undefined return wins:
   *   - Op[] → commit those ops (skip default)
   *   - null → abort gesture (no batch, no history entry)
   *   - undefined → defer to next behavior or default
   */
  onEnd?(ctx: GestureContext<TPose>): Op[] | null | void;
}

/**
 * Transient gesture state for renderers. `null` when no gesture is in flight.
 */
export interface MoveOverlay<TPose> {
  draggedIds: string[];
  poses: Map<string, TPose>;
  snapped: SnapTarget<TPose> | null;
  hideIds: string[];
}
