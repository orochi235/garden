/**
 * Local replacement for the `createDragGhost` that was removed from
 * `@orochi235/weasel` in 0.2.0.
 *
 * Creates a fixed-position, pointer-events-none screen overlay containing a
 * <canvas> element.  The canvas is scaled by `devicePixelRatio` so it renders
 * crisply on hi-DPI displays.  The ghost centers on the cursor position given
 * to `move()`.
 */

export interface DragGhost {
  /** Reposition the ghost so it is centered on (clientX, clientY). */
  move(clientX: number, clientY: number): void;
  /** Re-invoke the paint callback (e.g. after an async icon load). */
  repaint(): void;
  /** Show or hide the ghost without removing it from the DOM. */
  setHidden(hidden: boolean): void;
  /** Remove the ghost from the DOM. */
  destroy(): void;
}

export interface DragGhostOptions {
  /** Side length of the square ghost, in CSS pixels. */
  sizeCss: number;
  /** Called once at construction and again on every `repaint()` call. */
  paint: (ctx: CanvasRenderingContext2D, size: number) => void;
}

/**
 * Create a floating drag-ghost overlay centered on the cursor.
 *
 * The returned object must be destroyed by the caller (`ghost.destroy()`) when
 * the gesture ends.
 */
export function createDragGhost({ sizeCss, paint }: DragGhostOptions): DragGhost {
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1;
  const physicalSize = Math.ceil(sizeCss * dpr);

  // Outer wrapper — positions the ghost on screen.
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position: fixed',
    'pointer-events: none',
    `width: ${sizeCss}px`,
    `height: ${sizeCss}px`,
    'z-index: 1000',
    'top: 0',
    'left: 0',
    // Start off-screen so there's no flash before the first move().
    'transform: translate(-9999px, -9999px)',
  ].join('; ');

  const canvas = document.createElement('canvas');
  canvas.width = physicalSize;
  canvas.height = physicalSize;
  canvas.style.width = `${sizeCss}px`;
  canvas.style.height = `${sizeCss}px`;
  wrapper.appendChild(canvas);
  document.body.appendChild(wrapper);

  function doPaint() {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, physicalSize, physicalSize);
    // Translate so (0,0) is the center of the canvas, matching the
    // cursor-centering convention the callers expect.
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(sizeCss / 2, sizeCss / 2);
    paint(ctx, sizeCss);
    ctx.restore();
  }

  doPaint();

  return {
    move(clientX: number, clientY: number) {
      const half = sizeCss / 2;
      wrapper.style.transform = `translate(${clientX - half}px, ${clientY - half}px)`;
    },
    repaint() {
      doPaint();
    },
    setHidden(hidden: boolean) {
      wrapper.style.display = hidden ? 'none' : '';
    },
    destroy() {
      wrapper.remove();
    },
  };
}
