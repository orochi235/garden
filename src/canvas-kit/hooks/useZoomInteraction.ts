import { useCallback, useMemo } from 'react';

export interface UseZoomInteractionOptions {
  zoom: number;
  setZoom: (next: number) => void;
  pan: { x: number; y: number };
  setPan: (next: { x: number; y: number }) => void;
  min?: number;
  max?: number;
  wheelStep?: number;
  keyStep?: number;
  viewport?: { width: number; height: number };
  sources?: {
    wheel?: boolean;
    keys?: boolean;
    doubleClick?: boolean;
    pinch?: boolean;
  };
  wheelRequiresModifier?: boolean;
}

export interface UseZoomInteractionReturn {
  onWheel(e: WheelEvent | React.WheelEvent): void;
  onKeyDown(e: KeyboardEvent | React.KeyboardEvent): void;
  onDoubleClick(e: MouseEvent | React.MouseEvent): void;
  zoomTo(level: number, focal?: { x: number; y: number }): void;
  zoomBy(factor: number, focal?: { x: number; y: number }): void;
  reset(): void;
}

const clamp = (z: number, min: number, max: number) =>
  Math.min(max, Math.max(min, z));

function isEditableTarget(t: EventTarget | null): boolean {
  if (!t) return false;
  const el = t as Partial<{ tagName: string; isContentEditable: boolean }>;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function useZoomInteraction(
  opts: UseZoomInteractionOptions,
): UseZoomInteractionReturn {
  const min = opts.min ?? 0.1;
  const max = opts.max ?? 10;
  const wheelStep = opts.wheelStep ?? 1.1;
  const keyStep = opts.keyStep ?? 1.25;

  const sources = useMemo(
    () => ({
      wheel: opts.sources?.wheel ?? true,
      keys: opts.sources?.keys ?? true,
      doubleClick: opts.sources?.doubleClick ?? false,
      pinch: opts.sources?.pinch ?? true,
    }),
    [opts.sources?.wheel, opts.sources?.keys, opts.sources?.doubleClick, opts.sources?.pinch],
  );

  const applyZoom = useCallback(
    (nextZoom: number, focal: { x: number; y: number }) => {
      const oldZoom = opts.zoom;
      const newZoom = clamp(nextZoom, min, max);
      const k = newZoom / oldZoom;
      const newPan = {
        x: focal.x - (focal.x - opts.pan.x) * k,
        y: focal.y - (focal.y - opts.pan.y) * k,
      };
      opts.setZoom(newZoom);
      opts.setPan(newPan);
    },
    [opts, min, max],
  );

  const viewportCenter = useCallback((): { x: number; y: number } => {
    if (!opts.viewport) {
      throw new Error(
        'useZoomInteraction: viewport option is required for keyboard zoom and zoomTo without focal',
      );
    }
    return { x: opts.viewport.width / 2, y: opts.viewport.height / 2 };
  }, [opts.viewport]);

  const zoomTo = useCallback(
    (level: number, focal?: { x: number; y: number }) => {
      applyZoom(level, focal ?? viewportCenter());
    },
    [applyZoom, viewportCenter],
  );

  const zoomBy = useCallback(
    (factor: number, focal?: { x: number; y: number }) => {
      applyZoom(opts.zoom * factor, focal ?? viewportCenter());
    },
    [applyZoom, opts.zoom, viewportCenter],
  );

  const reset = useCallback(() => {
    opts.setZoom(1);
    opts.setPan({ x: 0, y: 0 });
  }, [opts]);

  const onWheel = useCallback(
    (e: WheelEvent | React.WheelEvent) => {
      const evt = e as WheelEvent;
      const isPinch = evt.ctrlKey === true;

      if (isPinch) {
        if (!sources.pinch) return;
        evt.preventDefault?.();
      } else {
        if (!sources.wheel) return;
        if (opts.wheelRequiresModifier && !evt.metaKey) return;
      }

      const target = evt.currentTarget as Element | null;
      const rect = target?.getBoundingClientRect?.();
      const focal = {
        x: evt.clientX - (rect?.left ?? 0),
        y: evt.clientY - (rect?.top ?? 0),
      };

      const factor = evt.deltaY < 0 ? wheelStep : 1 / wheelStep;
      applyZoom(opts.zoom * factor, focal);
    },
    [applyZoom, opts, sources, wheelStep],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent | React.KeyboardEvent) => {
      if (!sources.keys) return;
      const evt = e as KeyboardEvent;
      if (isEditableTarget(evt.target)) return;

      if (evt.key === '0' && (evt.metaKey || evt.ctrlKey)) {
        opts.setZoom(1);
        opts.setPan({ x: 0, y: 0 });
        return;
      }

      let factor = 0;
      if (evt.key === '+' || evt.key === '=') factor = keyStep;
      else if (evt.key === '-' || evt.key === '_') factor = 1 / keyStep;
      if (factor === 0) return;

      applyZoom(opts.zoom * factor, viewportCenter());
    },
    [applyZoom, opts, sources, keyStep, viewportCenter],
  );

  const onDoubleClick = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      if (!sources.doubleClick) return;
      const evt = e as MouseEvent;
      if (evt.altKey) {
        opts.setZoom(1);
        opts.setPan({ x: 0, y: 0 });
        return;
      }
      const target = evt.currentTarget as Element | null;
      const rect = target?.getBoundingClientRect?.();
      const focal = {
        x: evt.clientX - (rect?.left ?? 0),
        y: evt.clientY - (rect?.top ?? 0),
      };
      const factor = evt.shiftKey ? 1 / keyStep : keyStep;
      applyZoom(opts.zoom * factor, focal);
    },
    [applyZoom, opts, sources, keyStep],
  );

  return { onWheel, onKeyDown, onDoubleClick, zoomTo, zoomBy, reset };
}
