/**
 * canvas-kit — domain-agnostic 2D scene graph primitives.
 *
 * Viewport math, pointer-driven drag, layered canvas rendering, and a few
 * generic renderers (grid, labels, markdown text). Everything in this barrel
 * is free of garden-specific types so it can power the drag-lab and any
 * future apps without a unifying domain underneath.
 *
 * Currently exposed (Tier 1 — verbatim moves from `utils/` and `canvas/`):
 *   - View transform: `ViewTransform`, `worldToScreen`, `screenToWorld`, `roundToCell`
 *   - Pointer drag: `useDragHandle`, `useDropZone`, `DragPayload`, threshold helpers
 *   - Drag ghost: `createDragGhost`
 *   - Canvas plumbing: `useCanvasSize`, `useLayerEffect`, `fitZoom`
 *   - Layer composition: `RenderLayer`, `runLayers`, `LayerRenderer`
 *   - Renderers: `renderGrid`, `renderLabel`, markdown text utilities, pattern cache
 *
 * Per-hook subpath imports: `snapToGrid` exists for move, resize, and insert
 * with different return shapes. Import from the hook-specific subpath:
 *   import { snapToGrid } from '@/canvas-kit/move';
 *   import { snapToGrid, clampMinSize } from '@/canvas-kit/resize';
 *   import { snapToGrid } from '@/canvas-kit/insert';
 */

export * from './grid';
export * from './dragGhost';
export * from './thresholdDrag';
export * from './pointerDrag';
export * from './useCanvasSize';
export * from './hooks/useLayerEffect';
export * from './hooks/fitToBounds';
export * from './hooks/usePanInteraction';
export * from './hooks/useAutoCenter';
export * from './wheelHandler';
export * from './renderLayer';
export * from './LayerRenderer';
export * from './renderGrid';
export * from './renderLabel';
export * from './markdownText';
export * from './patterns';
export * from './ops';
export * from './history';
export * from './adapters/types';
export * from './interactions/types';
export { snap, gridSnapStrategy } from './interactions/shared';
export { useMoveInteraction } from './interactions/move';
export type {
  UseMoveInteractionOptions,
  UseMoveInteractionReturn,
  MoveStartArgs,
  MoveMoveArgs,
} from './interactions/move';
export { useResizeInteraction } from './interactions/resize';
export type {
  UseResizeInteractionOptions,
  UseResizeInteractionReturn,
} from './interactions/resize';
export { useInsertInteraction } from './interactions/insert';
export type {
  UseInsertInteractionOptions,
  UseInsertInteractionReturn,
} from './interactions/insert';
// snapToGrid / snapToContainer / snapBackOrDelete are NOT re-exported at top level —
// import from '@/canvas-kit/move' to disambiguate from resize/insert siblings.
