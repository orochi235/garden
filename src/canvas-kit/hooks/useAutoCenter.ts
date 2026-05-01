import { useEffect, useRef } from 'react';
import { fitZoom } from './fitToBounds';

/**
 * Compute zoom and pan that fit `contentW x contentH` (in content units)
 * inside `viewportW x viewportH` (in pixels). `padRatio` is the fraction of
 * each axis to fill (default 0.85 — leaves a uniform 15% margin).
 */
export function computeFitView(
  viewportW: number,
  viewportH: number,
  contentW: number,
  contentH: number,
  padRatio = 0.85,
): { zoom: number; panX: number; panY: number } {
  const zoom = fitZoom(viewportW * padRatio, viewportH * padRatio, contentW, contentH);
  const cw = contentW * zoom;
  const ch = contentH * zoom;
  return { zoom, panX: (viewportW - cw) / 2, panY: (viewportH - ch) / 2 };
}

/**
 * Run `computeFitView` once when the viewport first has non-zero size, and
 * apply the result via the supplied setters. Subsequent size changes are
 * ignored — this hook centers exactly once.
 */
export function useAutoCenter(
  width: number,
  height: number,
  contentW: number,
  contentH: number,
  setZoom: (z: number) => void,
  setPan: (x: number, y: number) => void,
) {
  const hasCentered = useRef(false);

  useEffect(() => {
    if (width > 0 && height > 0 && !hasCentered.current) {
      hasCentered.current = true;
      const fit = computeFitView(width, height, contentW, contentH);
      setZoom(fit.zoom);
      setPan(fit.panX, fit.panY);
    }
  }, [width, height, contentW, contentH, setZoom, setPan]);
}
