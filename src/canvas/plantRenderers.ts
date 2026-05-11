/**
 * Plant renderers — renders plant icons from PNG image data stored in the
 * cultivar/species database (`iconImage` field, base64 data URI).
 *
 * Falls back to a simple colored circle when no image is available.
 */

import type { DrawCommand } from './util/weaselLocal';
import { circlePolygon } from './util/weaselLocal';
import { getCultivar } from '../model/cultivars';


// ---------------------------------------------------------------------------
// Image cache — decode base64 data URIs once, reuse across frames
// ---------------------------------------------------------------------------

const imageCache = new Map<string, HTMLImageElement>();
const pendingLoads = new Set<string>();
const loadCallbacks = new Set<() => void>();

// ---------------------------------------------------------------------------
// ImageBitmap cache — decoded bitmaps for DrawCommand consumers
// ---------------------------------------------------------------------------

const bitmapCache = new Map<string, ImageBitmap>();
/** cultivarIds for which a createImageBitmap call is already in flight. */
const pendingBitmaps = new Set<string>();

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

/**
 * Get the decoded ImageBitmap for a cultivar's icon, kicking off async
 * decode on first call. Returns null when not yet ready; subscribers via
 * `onIconLoad` are notified when it becomes available. The bitmap is the
 * raw image — circular clipping is applied at draw time via a clip group.
 */
export function getIconBitmap(cultivarId: string): ImageBitmap | null {
  const hit = bitmapCache.get(cultivarId);
  if (hit) return hit;

  if (pendingBitmaps.has(cultivarId)) return null;

  const cultivar = getCultivar(cultivarId);
  const dataUri = cultivar?.iconImage;
  if (!dataUri) return null;

  pendingBitmaps.add(cultivarId);

  const decodeFromImg = (img: HTMLImageElement) => {
    createImageBitmap(img).then((bitmap) => {
      bitmapCache.set(cultivarId, bitmap);
      pendingBitmaps.delete(cultivarId);
      for (const cb of loadCallbacks) cb();
    }).catch((err) => {
      console.warn(`[plantRenderers] createImageBitmap failed for ${cultivarId}:`, err);
      pendingBitmaps.delete(cultivarId);
    });
  };

  const existing = imageCache.get(dataUri);
  if (existing) {
    decodeFromImg(existing);
    return null;
  }

  // Not yet loaded — kick off the HTMLImageElement load and decode once it lands.
  const img = new Image();
  img.onload = () => {
    imageCache.set(dataUri, img);
    pendingLoads.delete(dataUri);
    decodeFromImg(img);
  };
  img.onerror = () => {
    pendingLoads.delete(dataUri);
    pendingBitmaps.delete(cultivarId);
  };
  if (!pendingLoads.has(dataUri)) {
    pendingLoads.add(dataUri);
    img.src = dataUri;
  } else {
    // Another load is already in flight (e.g. the palette sidebar). Piggyback:
    // every time ANY icon finishes loading, check whether OUR image is now
    // cached, and unsubscribe only once we've kicked off our decode.
    const unsub = onIconLoad(() => {
      const loaded = imageCache.get(dataUri);
      if (!loaded) return;
      unsub();
      if (pendingBitmaps.has(cultivarId)) {
        decodeFromImg(loaded);
      }
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// DrawCommand builder — world-layer consumers use this instead of ctx API
// ---------------------------------------------------------------------------


/**
 * Build DrawCommands for a single plant glyph centered at (cx, cy) in world
 * coords. Emits the footprint background circle, the icon image (clipped to
 * a circle via a group), and a fallback stroke ring when the icon isn't ready.
 */
export function plantDrawCommands(
  cultivarId: string,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  iconBgColor?: string | null,
): DrawCommand[] {
  const cultivar = getCultivar(cultivarId);
  const bgColor = iconBgColor ?? cultivar?.iconBgColor ?? color;

  const cmds: DrawCommand[] = [];
  // Skip the bg fill when caller asked for transparent or null — the renderer's
  // parseColor doesn't accept the 'transparent' keyword.
  if (bgColor && bgColor !== 'transparent') {
    cmds.push({
      kind: 'path',
      path: circlePolygon(cx, cy, radius),
      fill: { fill: 'solid', color: bgColor },
    });
  }

  const bitmap = getIconBitmap(cultivarId);
  if (bitmap) {
    cmds.push({
      kind: 'group',
      clip: circlePolygon(cx, cy, radius),
      children: [{
        kind: 'image',
        image: bitmap,
        x: cx - radius,
        y: cy - radius,
        w: radius * 2,
        h: radius * 2,
      }],
    });
  } else {
    cmds.push({
      kind: 'path',
      path: circlePolygon(cx, cy, radius),
      stroke: { paint: { fill: 'solid', color }, width: radius * 0.06 },
    });
  }

  return cmds;
}

// ---------------------------------------------------------------------------
// Fallback — simple colored circle/square when no image available
// ---------------------------------------------------------------------------

function drawFallback(
  ctx: CanvasRenderingContext2D,
  radius: number,
  color: string,
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
  drawFallback(ctx, radius, color);
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

  drawFallback(ctx, radius, color);
}
