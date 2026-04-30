/**
 * Wire up a pointer-driven drag with a movement threshold before activation.
 * Caller controls all listeners and side effects via callbacks. Captures
 * the pointer on the originating element so drags survive over-canvas/scroll.
 */
export interface ThresholdDragOptions {
  threshold?: number;
  onActivate?: (e: PointerEvent) => void;
  onMove: (e: PointerEvent) => void;
  onCommit: (e: PointerEvent) => void;
  onCancel?: () => void;
}

export interface ThresholdDragHandle {
  /** True after the pointer has moved past `threshold` and the drag is live. */
  isDragging: () => boolean;
}

export function startThresholdDrag(
  e: React.PointerEvent,
  opts: ThresholdDragOptions,
): ThresholdDragHandle {
  const startX = e.clientX;
  const startY = e.clientY;
  const threshold = opts.threshold ?? 4;
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  let activated = false;

  function maybeActivate(ev: PointerEvent) {
    if (activated) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (dx * dx + dy * dy < threshold * threshold) return;
    activated = true;
    opts.onActivate?.(ev);
  }

  function onMove(ev: PointerEvent) {
    maybeActivate(ev);
    if (!activated) return;
    opts.onMove(ev);
  }

  function cleanup() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
  }

  function onUp(ev: PointerEvent) {
    cleanup();
    try {
      target.releasePointerCapture(ev.pointerId);
    } catch {}
    if (!activated) {
      opts.onCancel?.();
      return;
    }
    opts.onCommit(ev);
  }

  function onCancel() {
    cleanup();
    opts.onCancel?.();
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);

  return { isDragging: () => activated };
}
