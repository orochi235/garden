/**
 * Cursor-following drag ghost. The ghost is a canvas painted by `paint`, sized in CSS pixels.
 * Use `setHidden(true)` while a putative placement is visible on the main canvas, so the user
 * sees either the in-canvas putative or the cursor ghost — never both at once.
 *
 * Wherever a drag produces a canvas placement, prefer this helper so the visual stays consistent:
 * the ghost matches what the dropped object will look like (icon, footprint), at the size it will
 * appear on the canvas given the current zoom.
 */
export interface DragGhost {
  move(clientX: number, clientY: number): void;
  setHidden(hidden: boolean): void;
  repaint(): void;
  destroy(): void;
}

export interface DragGhostOptions {
  /** Visual diameter/side of the ghost in CSS pixels. */
  sizeCss: number;
  /** Paint callback. ctx is pre-translated to the ghost center; clear is handled by the caller's redraws. */
  paint: (ctx: CanvasRenderingContext2D, sizeCss: number) => void;
  /** Optional opacity (default 0.85). */
  opacity?: number;
}

export function createDragGhost(opts: DragGhostOptions): DragGhost {
  const { sizeCss, paint, opacity = 0.85 } = opts;
  const dpr = window.devicePixelRatio || 1;
  const padded = Math.max(8, Math.ceil(sizeCss + 4));
  const el = document.createElement('canvas');
  el.width = padded * dpr;
  el.height = padded * dpr;
  el.style.cssText = [
    'position:fixed', 'pointer-events:none', 'z-index:9999',
    `width:${padded}px`, `height:${padded}px`,
    'transform:translate(-50%,-50%)',
    `opacity:${opacity}`,
  ].join(';');
  document.body.appendChild(el);

  function repaint() {
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, padded, padded);
    ctx.translate(padded / 2, padded / 2);
    paint(ctx, padded);
  }

  repaint();

  return {
    move(x, y) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    },
    setHidden(hidden) {
      el.style.visibility = hidden ? 'hidden' : '';
    },
    repaint,
    destroy() {
      el.remove();
    },
  };
}
