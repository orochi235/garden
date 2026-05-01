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
export interface GestureContext<TPose, TObject extends { id: string } = { id: string }> {
  draggedIds: string[];
  origin: Map<string, TPose>;
  current: Map<string, TPose>;
  snap: SnapTarget<TPose> | null;
  modifiers: ModifierState;
  pointer: PointerState;
  adapter: MoveAdapter<TObject, TPose>;
  /**
   * Per-gesture mutable store. Keys should be namespaced by behavior name to avoid
   * collisions: `'behaviorName'` for a single value, `'behaviorName.field'` for
   * sub-keys. Two behaviors sharing a key will silently clobber each other.
   */
  scratch: Record<string, unknown>;
}

export interface SnapStrategy<TPose> {
  snap(pose: TPose, ctx: GestureContext<TPose, { id: string }>): TPose | null;
}

/**
 * Generalized base behavior. Each hook defines an alias that pins the
 * proposed-pose shape (TProposed) and the onMove return shape (TMoveResult).
 * onEnd is uniform: first non-undefined return wins (Op[] = commit those,
 * null = abort, undefined = defer).
 *
 * `defaultTransient`: when at least one behavior in a gesture sets this true
 * AND the hook's `options.transient` is not explicitly set, the gesture
 * commits its ops via `adapter.applyOps(ops)` (no history entry). When
 * `options.transient` is set explicitly, that value wins.
 */
export interface GestureBehavior<TPose, TProposed, TMoveResult> {
  defaultTransient?: boolean;
  onStart?(ctx: GestureContext<TPose>): void;
  onMove?(ctx: GestureContext<TPose>, proposed: TProposed): TMoveResult | void;
  onEnd?(ctx: GestureContext<TPose>): Op[] | null | void;
}

// ----- move -----

export interface BehaviorMoveResult<TPose> {
  pose?: TPose;
  snap?: SnapTarget<TPose> | null;
}

export type MoveBehavior<TPose> = GestureBehavior<TPose, TPose, BehaviorMoveResult<TPose>>;

export interface MoveOverlay<TPose> {
  draggedIds: string[];
  poses: Map<string, TPose>;
  snapped: SnapTarget<TPose> | null;
  hideIds: string[];
}

// ----- resize -----

export type ResizeAnchor = {
  x: 'min' | 'max' | 'free';
  y: 'min' | 'max' | 'free';
};

export interface ResizePose {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResizeProposed<TPose extends ResizePose> {
  pose: TPose;
  anchor: ResizeAnchor;
}

export interface ResizeMoveResult<TPose extends ResizePose> {
  pose?: TPose;
}

export type ResizeBehavior<TPose extends ResizePose> = GestureBehavior<
  TPose,
  ResizeProposed<TPose>,
  ResizeMoveResult<TPose>
>;

export interface ResizeOverlay<TPose extends ResizePose> {
  id: string;
  currentPose: TPose;
  targetPose: TPose;
  anchor: ResizeAnchor;
}

// ----- insert -----

export interface InsertProposed<TPose extends { x: number; y: number }> {
  start: TPose;
  current: TPose;
}

export interface InsertMoveResult<TPose extends { x: number; y: number }> {
  start?: TPose;
  current?: TPose;
}

export type InsertBehavior<TPose extends { x: number; y: number }> = GestureBehavior<
  TPose,
  InsertProposed<TPose>,
  InsertMoveResult<TPose>
>;

export interface InsertOverlay<TPose extends { x: number; y: number }> {
  start: TPose;
  current: TPose;
}

// ----- area-select -----

/** Pose carried through area-select gestures: the world point under the
 *  cursor at gesture start, plus the shift-key state at start. */
export interface AreaSelectPose {
  worldX: number;
  worldY: number;
  shiftHeld: boolean;
}

export interface AreaSelectProposed {
  start: { worldX: number; worldY: number };
  current: { worldX: number; worldY: number };
  shiftHeld: boolean;
}

/** onMove for area-select doesn't shape ops; behaviors only need to react in
 *  onEnd. We return void from onMove. */
export type AreaSelectMoveResult = void;

export type AreaSelectBehavior = GestureBehavior<
  AreaSelectPose,
  AreaSelectProposed,
  AreaSelectMoveResult
>;

export interface AreaSelectOverlay {
  start: { worldX: number; worldY: number };
  current: { worldX: number; worldY: number };
  shiftHeld: boolean;
}

// ----- clipboard -----

/**
 * Opaque clipboard payload. `items` is `unknown[]` so each app's clipboard
 * adapter stores whatever shape it wants; the kit never inspects entries.
 *
 * The adapter is responsible for both producing snapshots
 * (`snapshotSelection`) and consuming them (`commitPaste`). Type safety lives
 * at that boundary, not in the kit.
 */
export interface ClipboardSnapshot {
  items: unknown[];
}
