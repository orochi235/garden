/**
 * Vendored gesture types (pin contract).
 *
 * These are eric's local copy of weasel's pre-HEAD interaction-gesture types.
 * HEAD removed the imperative `useMove`/`useResize`/`useClone`/`useAreaSelect`
 * controllers (replaced by a declarative Action/dispatcher API) and, in the
 * process, changed `MoveBehavior.onMove` to return `{ transform }` instead of
 * the pin's `{ pose }`. Eric's bespoke behaviors (`snapMoveBehaviors`,
 * `structureMoveBehaviors`) and tools were written against the **pin** contract
 * and drive the controllers imperatively from eric's own `defineTool`/`ToolCtx`
 * framework. Rather than rewrite all of that against HEAD's Action API (a
 * deferred follow-up SP), we vendor the pin controllers + these pin types here
 * and reconcile their kit imports to HEAD's still-public primitives.
 *
 * Structural primitives still imported from `@orochi235/weasel` (HEAD-public,
 * shape-verified against `dist/types-Dh02rT4N.d.ts`): `Op`, `SnapTarget`,
 * `MoveAdapter`, `InsertAdapter`, `ResizeAdapter`, `LayoutStrategy`, `DropTarget`.
 */
import type { InsertAdapter, MoveAdapter, Op, SnapTarget } from '@orochi235/weasel';

/** Snapshot of modifier-key state at gesture dispatch. */
export interface ModifierState {
  alt: boolean;
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
}

/** Pointer position in both world and client coords. */
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
export interface GestureContext<TPose, TNode extends { id: string } = { id: string }> {
  draggedIds: string[];
  origin: Map<string, TPose>;
  current: Map<string, TPose>;
  snap: SnapTarget<TPose> | null;
  modifiers: ModifierState;
  pointer: PointerState;
  adapter: MoveAdapter<TNode, TPose>;
  /**
   * Per-gesture mutable store. Keys should be namespaced by behavior name to avoid
   * collisions: `'behaviorName'` for a single value, `'behaviorName.field'` for
   * sub-keys. Two behaviors sharing a key will silently clobber each other.
   */
  scratch: Record<string, unknown>;
}

/** Pluggable per-gesture snap rule; receives the proposed pose and returns a snapped pose or `null` to skip. */
export interface SnapStrategy<TPose> {
  snap(pose: TPose, ctx: GestureContext<TPose, { id: string }>): TPose | null;
}

/**
 * Generalized base behavior. Each hook defines an alias that pins the
 * proposed-pose shape (TProposed) and the onMove return shape (TMoveResult).
 * onEnd is uniform: first non-undefined return wins (Op[] = commit those,
 * null = abort, undefined = defer).
 */
export interface GestureBehavior<TPose, TProposed, TMoveResult> {
  defaultTransient?: boolean;
  onStart?(ctx: GestureContext<TPose>): void;
  onMove?(ctx: GestureContext<TPose>, proposed: TProposed): TMoveResult | undefined;
  onEnd?(ctx: GestureContext<TPose>): Op[] | null | undefined;
}

// ----- move -----

/** Per-frame result a `MoveBehavior.onMove` can return to override pose / snap target. */
export interface BehaviorMoveResult<TPose> {
  pose?: TPose;
  snap?: SnapTarget<TPose> | null;
}

/**
 * A behavior plugged into `useMove` — shapes the proposed pose during a drag.
 *
 * NOTE (pin contract): `onMove(ctx, proposed: TPose) => { pose }`. HEAD's
 * `MoveBehavior` diverged to `onMove(ctx, proposed: GroupTransform) =>
 * { transform }`; eric's behaviors depend on the pose-based shape, so this
 * is vendored rather than imported from the kit.
 */
export type MoveBehavior<TPose> = GestureBehavior<TPose, TPose, BehaviorMoveResult<TPose>>;

/** Live overlay state exposed by `useMove` for rendering ghosts and snap previews. */
export interface MoveOverlay<TPose> {
  draggedIds: string[];
  poses: Map<string, TPose>;
  snapped: SnapTarget<TPose> | null;
  hideIds: string[];
  /** Sibling poses in the destination container as a layout strategy
   *  proposes them during the live drag. Empty when no layout is engaged. */
  hypotheticalChildPositions: Map<string, TPose>;
  /** Sibling poses in the source container as the source's layout strategy
   *  proposes them when the dragged child has left it. Empty when no
   *  cross-container reflow is in flight. */
  sourceReflowPositions: Map<string, TPose>;
  /** The container the drag is currently over (for highlight chrome).
   *  null when the pointer is over no layout-bearing container. */
  destContainerId: string | null;
  /** False when no layout-bearing container has accepted the pointer. */
  accepted: boolean;
}

// ----- resize -----

/** Which corner/edge of the rect stays fixed during a resize. */
export type ResizeAnchor = {
  x: 'min' | 'max' | 'free';
  y: 'min' | 'max' | 'free';
};

/** Minimum rect-shaped pose required by the resize machinery. */
export interface ResizePose {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Per-frame proposed resize: pose plus the anchor pinning the opposite corner. */
export interface ResizeProposed<TPose extends ResizePose> {
  pose: TPose;
  anchor: ResizeAnchor;
}

/** Per-frame result a `ResizeBehavior.onMove` can return to override the proposed pose. */
export interface ResizeMoveResult<TPose extends ResizePose> {
  pose?: TPose;
}

/** A behavior plugged into `useResize`. */
export type ResizeBehavior<TPose extends ResizePose> = GestureBehavior<
  TPose,
  ResizeProposed<TPose>,
  ResizeMoveResult<TPose>
>;

/** Live overlay state exposed by `useResize` for rendering the in-flight resize ghost. */
export interface ResizeOverlay<TPose> {
  id: string;
  currentPose: TPose;
  targetPose: TPose;
  anchor: ResizeAnchor;
  /** Per-leaf scaled poses when the gesture is resizing a virtual group. */
  leafPoses?: Map<string, TPose>;
}

// ----- point-snap (used by useResize's pointSnapBehaviors slot) -----

/** Frames a point-snap behavior can return for the hook to back-solve. */
export type PointSnapFrame = 'dragged-corner' | 'fixed-corner' | 'center' | 'origin';

/** Per-frame world-space context handed to `PointSnapBehavior.onMove`. */
export interface PointSnapContext<TPose extends ResizePose> {
  draggedCorner: { worldX: number; worldY: number } | null;
  fixedCorner: { worldX: number; worldY: number } | null;
  center: { worldX: number; worldY: number };
  origin: { worldX: number; worldY: number };
  rotation: number;
  anchor: ResizeAnchor;
  proposed: TPose;
  modifiers: ModifierState;
}

/** Per-frame snap result. A behavior returns at most one. */
export interface PointSnapResult {
  frame: PointSnapFrame;
  worldX: number;
  worldY: number;
}

/** A point-snap behavior plugged into `useResize`'s `pointSnapBehaviors`. */
export interface PointSnapBehavior<TPose extends ResizePose> {
  id?: string;
  onMove(ctx: PointSnapContext<TPose>): PointSnapResult | null | undefined;
}

// ----- area-select -----

/** Pose carried through area-select gestures. */
export interface AreaSelectPose {
  worldX: number;
  worldY: number;
  shiftHeld: boolean;
}

/** Per-frame proposed area-select state: start point, current point, and shift policy. */
export interface AreaSelectProposed {
  start: { worldX: number; worldY: number };
  current: { worldX: number; worldY: number };
  shiftHeld: boolean;
}

/** onMove for area-select doesn't shape ops; behaviors only react in onEnd. */
export type AreaSelectMoveResult = undefined;

/** A behavior plugged into `useAreaSelect`. */
export type AreaSelectBehavior = GestureBehavior<
  AreaSelectPose,
  AreaSelectProposed,
  AreaSelectMoveResult
>;

/** Live overlay state exposed by `useAreaSelect` for rendering the marquee. */
export interface AreaSelectOverlay {
  start: { worldX: number; worldY: number };
  current: { worldX: number; worldY: number };
  shiftHeld: boolean;
}

// ----- clone -----

/** Pose carried through clone gestures: ids being cloned plus the pointer/offset state. */
export interface ClonePose {
  ids: string[];
  offset: { dx: number; dy: number };
  worldX: number;
  worldY: number;
}

/** Layer category a clone targets — kit-level placeholder; consumers may narrow. */
export type CloneLayer = 'structures' | 'zones' | 'plantings';

/** A behavior plugged into `useClone`; gates on modifier state and emits ops at gesture end. */
export interface CloneBehavior {
  id: string;
  /** Default true. */
  defaultTransient?: boolean;
  /** Decides whether this gesture should activate at start. */
  activates: (modifiers: ModifierState) => boolean;
  /** On end, returns ops to commit (or [] for no-op). */
  onEnd: (pose: ClonePose, ctx: { adapter: InsertAdapter<{ id: string }> }) => Op[];
}
