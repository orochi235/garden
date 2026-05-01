/**
 * canvas-kit — domain-agnostic 2D scene graph primitives.
 *
 * Viewport math, pointer-driven drag, layered canvas rendering, and a few
 * generic renderers (grid, labels, markdown text). Everything in this barrel
 * is free of garden-specific types so it can power the drag-lab and any
 * future apps without a unifying domain underneath.
 *
 * Currently exposed (Tier 1 — verbatim moves from `utils/` and `canvas/`):
 *   - View transform: `ViewTransform`, `worldToScreen`, `screenToWorld`, `snapToGrid`
 *   - Pointer drag: `useDragHandle`, `useDropZone`, `DragPayload`, threshold helpers
 *   - Drag ghost: `createDragGhost`
 *   - Canvas plumbing: `useCanvasSize`, `useLayerEffect`, `fitZoom`
 *   - Layer composition: `RenderLayer`, `runLayers`, `LayerRenderer`
 *   - Renderers: `renderGrid`, `renderLabel`, markdown text utilities, pattern cache
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
export { snapToContainer, snapBackOrDelete, snap, gridSnapStrategy } from './interactions/behaviors';
export { snapToGrid as snapToGridBehavior } from './interactions/behaviors/snapToGrid';
export { useMoveInteraction } from './interactions/move';
export type {
  UseMoveInteractionOptions,
  UseMoveInteractionReturn,
  MoveStartArgs,
  MoveMoveArgs,
} from './interactions/move';
