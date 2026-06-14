/**
 * Vendored garden-gesture surface (pin controllers + types).
 *
 * Eric drives these imperative gesture controllers from its own
 * `defineTool`/`ToolCtx` framework. They were removed from `@orochi235/weasel`
 * HEAD (replaced by the declarative Action/dispatcher API); vendored here with
 * kit imports reconciled to HEAD's still-public primitives. See `./types` for
 * the full rationale. Consumers import the gesture API from `../gestures`.
 */

export { type AreaSelectController, type UseAreaSelectOptions, useAreaSelect } from './areaSelect';
// Behaviors
export {
  cloneByAltDrag,
  selectFromMarquee,
  snapBackOrDelete,
  snapToGrid,
} from './behaviors';
export { type UseCloneOptions, type UseCloneReturn, useClone } from './clone';
// Geometry helpers
export {
  type CornerHandle,
  cornerResizeHandles,
  fixedCornerOf,
  type PoseDescriptor,
  RECT_POSE_DESCRIPTOR,
  rotatePoint,
} from './geometry';
// Controllers
export {
  type MoveController,
  type MoveMoveArgs,
  type MoveStartArgs,
  type UseMoveOptions,
  useMove,
} from './move';
export { type ResizeController, type UseResizeOptions, useResize } from './resize';

// Types (pin contract)
export type {
  AreaSelectBehavior,
  AreaSelectOverlay,
  AreaSelectPose,
  AreaSelectProposed,
  BehaviorMoveResult,
  CloneBehavior,
  CloneLayer,
  ClonePose,
  GestureBehavior,
  GestureContext,
  ModifierState,
  MoveBehavior,
  MoveOverlay,
  PointerState,
  PointSnapBehavior,
  PointSnapContext,
  PointSnapResult,
  ResizeAnchor,
  ResizeBehavior,
  ResizeMoveResult,
  ResizeOverlay,
  ResizePose,
  ResizeProposed,
  SnapStrategy,
} from './types';
