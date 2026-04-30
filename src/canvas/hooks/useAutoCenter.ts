import { useEffect, useRef } from 'react';
import { useUiStore } from '../../store/uiStore';
import { fitZoom } from './fitToBounds';

/** Compute zoom and pan values that fit the garden within the viewport. */
export function computeFitView(
  viewportW: number,
  viewportH: number,
  gardenWidthFt: number,
  gardenHeightFt: number,
): { zoom: number; panX: number; panY: number } {
  // Garden uses a ratio-style padding: content fills 85% of each axis.
  const ratio = 0.85;
  const zoom = fitZoom(viewportW * ratio, viewportH * ratio, gardenWidthFt, gardenHeightFt);
  const gardenW = gardenWidthFt * zoom;
  const gardenH = gardenHeightFt * zoom;
  return { zoom, panX: (viewportW - gardenW) / 2, panY: (viewportH - gardenH) / 2 };
}

export function useAutoCenter(
  width: number,
  height: number,
  gardenWidthFt: number,
  gardenHeightFt: number,
  setPan: (x: number, y: number) => void,
) {
  const hasCentered = useRef(false);

  useEffect(() => {
    if (width > 0 && height > 0 && !hasCentered.current) {
      hasCentered.current = true;
      const fit = computeFitView(width, height, gardenWidthFt, gardenHeightFt);
      useUiStore.getState().setZoom(fit.zoom);
      setPan(fit.panX, fit.panY);
    }
  }, [width, height, gardenWidthFt, gardenHeightFt, setPan]);
}
