/**
 * Selection overlay — a reusable render layer for drawing selection outlines
 * and corner resize handles in world space.
 *
 * Two pieces:
 *   - `composeSelectionPose` resolves the live pose for a selected id by
 *     consulting the move overlay first, then the resize overlay, then the
 *     stored pose.
 *   - `createSelectionOverlayLayer` returns a `RenderLayer` that draws an
 *     outline + 4 corner handles for each currently-selected id.
 *
 * Both pieces are domain-agnostic: callers supply pose-shaped values and the
 * layer treats them as plain rectangles.
 */

import type { RenderLayer } from './renderLayer';

export interface ComposeSelectionPoseOpts<TPose> {
  /** Move overlay; when present its `poses` map wins over everything else. */
  moveOverlay?: { poses: Map<string, TPose> } | null;
  /** Resize overlay; consulted only when move overlay does not own the id. */
  resizeOverlay?: { id: string; currentPose: TPose } | null;
  /** Fallback pose lookup (typically the stored/committed pose). */
  getStoredPose: (id: string) => TPose;
}

/**
 * Build a pose resolver for a selection. Precedence per id:
 * move overlay > resize overlay > stored.
 */
export function composeSelectionPose<TPose>(
  opts: ComposeSelectionPoseOpts<TPose>,
): (id: string) => TPose {
  const { moveOverlay, resizeOverlay, getStoredPose } = opts;
  return (id: string): TPose => {
    const moved = moveOverlay?.poses.get(id);
    if (moved !== undefined) return moved;
    if (resizeOverlay && resizeOverlay.id === id) return resizeOverlay.currentPose;
    return getStoredPose(id);
  };
}

interface RectPose {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionOverlayLayerOpts<TPose extends RectPose> {
  getSelection: () => string[];
  /** Return null to skip rendering for an id (e.g. resolved pose unavailable). */
  getPose: (id: string) => TPose | null;
  outline?: { stroke: string; width?: number; pad?: number };
  handles?:
    | {
        size?: number;
        fill?: string;
        stroke?: string;
        strokeWidth?: number;
      }
    | false;
  /** Override handle placement. Default: 4 corners. Each point is a center. */
  handlesOf?: (pose: TPose) => { x: number; y: number }[];
}

const DEFAULT_OUTLINE = { stroke: '#f0e0a8', width: 2, pad: 1 };
const DEFAULT_HANDLES = {
  size: 8,
  fill: '#d4c4a8',
  stroke: '#1a130d',
  strokeWidth: 1,
};

function defaultHandlesOf(p: RectPose): { x: number; y: number }[] {
  return [
    { x: p.x, y: p.y },
    { x: p.x + p.width, y: p.y },
    { x: p.x, y: p.y + p.height },
    { x: p.x + p.width, y: p.y + p.height },
  ];
}

/**
 * Create a `RenderLayer` that draws selection outlines and corner handles.
 * The layer renders in world space — i.e. it assumes the caller's render
 * pipeline has already applied any view transform to the canvas context.
 */
export function createSelectionOverlayLayer<TPose extends RectPose>(
  opts: SelectionOverlayLayerOpts<TPose>,
): RenderLayer<unknown> {
  const outline = { ...DEFAULT_OUTLINE, ...(opts.outline ?? {}) };
  const handlesEnabled = opts.handles !== false;
  const handles = handlesEnabled
    ? { ...DEFAULT_HANDLES, ...(opts.handles === false ? {} : opts.handles ?? {}) }
    : null;
  const handlesOf = opts.handlesOf ?? defaultHandlesOf;

  return {
    id: 'selection-overlay',
    label: 'Selection',
    draw: (ctx: CanvasRenderingContext2D) => {
      const ids = opts.getSelection();
      if (ids.length === 0) return;

      // Outlines first, handles second — matches the stacking order the demo
      // and production app already use.
      ctx.strokeStyle = outline.stroke;
      ctx.lineWidth = outline.width;
      const pad = outline.pad;
      for (const id of ids) {
        const p = opts.getPose(id);
        if (!p) continue;
        ctx.strokeRect(p.x - pad, p.y - pad, p.width + pad * 2, p.height + pad * 2);
      }

      if (!handles) return;

      ctx.fillStyle = handles.fill;
      ctx.strokeStyle = handles.stroke;
      ctx.lineWidth = handles.strokeWidth;
      const half = handles.size / 2;
      for (const id of ids) {
        const p = opts.getPose(id);
        if (!p) continue;
        for (const h of handlesOf(p)) {
          ctx.fillRect(h.x - half, h.y - half, handles.size, handles.size);
          ctx.strokeRect(h.x - half, h.y - half, handles.size, handles.size);
        }
      }
    },
  };
}
