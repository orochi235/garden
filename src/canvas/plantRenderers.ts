/**
 * Plant renderers — renders plant icons from PNG image data stored in the
 * cultivar/species database (`iconImage` field, base64 data URI).
 *
 * Falls back to a simple colored circle when no image is available.
 */

import { getCultivar } from '../model/cultivars';

export type PlantShape = 'square' | 'circle';

// ---------------------------------------------------------------------------
// Image cache — decode base64 data URIs once, reuse across frames
// ---------------------------------------------------------------------------

const imageCache = new Map<string, HTMLImageElement>();
const pendingLoads = new Set<string>();
const loadCallbacks = new Set<() => void>();

/** Register a callback to be notified when any icon image finishes loading. */
export function onIconLoad(cb: () => void): () => void {
  loadCallbacks.add(cb);
  return () => loadCallbacks.delete(cb);
}

function getImage(dataUri: string): HTMLImageElement | null {
  const cached = imageCache.get(dataUri);
  if (cached) return cached;

  if (pendingLoads.has(dataUri)) return null;
  pendingLoads.add(dataUri);

  const img = new Image();
  img.onload = () => {
    imageCache.set(dataUri, img);
    pendingLoads.delete(dataUri);
    for (const cb of loadCallbacks) cb();
  };
  img.onerror = () => {
    pendingLoads.delete(dataUri);
  };
  img.src = dataUri;
  return null;
}

// ---------------------------------------------------------------------------
// Fallback — simple colored circle/square when no image available
// ---------------------------------------------------------------------------

function drawFallback(
  ctx: CanvasRenderingContext2D,
  radius: number,
  color: string,
  shape: PlantShape,
): void {
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, radius * 0.06);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Render a plant icon for a cultivar. Uses the PNG iconImage when available. */
export function renderPlant(
  ctx: CanvasRenderingContext2D,
  cultivarId: string,
  radius: number,
  color: string,
  shape: PlantShape = 'square',
  iconBgColor?: string | null,
): void {
  const cultivar = getCultivar(cultivarId);
  const dataUri = cultivar?.iconImage;
  const bgColor = iconBgColor ?? cultivar?.iconBgColor ?? color;

  // Always draw the footprint circle background
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.restore();

  if (dataUri) {
    const img = getImage(dataUri);
    if (img) {
      ctx.save();
      // Clip to circle regardless of shape
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, -radius, -radius, radius * 2, radius * 2);
      ctx.restore();
      return;
    }
  }

  // Fallback: draw colored shape on top of the bg circle
  drawFallback(ctx, radius, color, shape);
}

/** Render a plant icon — used for palette buttons. */
export function renderIcon(
  ctx: CanvasRenderingContext2D,
  cultivarId: string,
  radius: number,
  color: string,
): void {
  const cultivar = getCultivar(cultivarId);
  const dataUri = cultivar?.iconImage;

  if (dataUri) {
    const img = getImage(dataUri);
    if (img) {
      ctx.drawImage(img, -radius, -radius, radius * 2, radius * 2);
      return;
    }
  }

  drawFallback(ctx, radius, color, 'square');
}
