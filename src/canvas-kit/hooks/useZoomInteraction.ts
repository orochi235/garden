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

  // Stubbed in Task 1; Tasks 3-5 implement.
  const onWheel = useCallback((_e: WheelEvent | React.WheelEvent) => {}, []);
  const onKeyDown = useCallback((_e: KeyboardEvent | React.KeyboardEvent) => {}, []);
  const onDoubleClick = useCallback((_e: MouseEvent | React.MouseEvent) => {}, []);

  // suppress "declared but unread" until we wire them
  void sources;
  void wheelStep;
  void keyStep;

  return { onWheel, onKeyDown, onDoubleClick, zoomTo, zoomBy, reset };
}
