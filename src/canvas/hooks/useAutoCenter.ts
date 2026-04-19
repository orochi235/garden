import { useRef, useEffect } from 'react';
import { useUiStore } from '../../store/uiStore';

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
      const padding = 0.85;
      const fitZoom = Math.min(
        (width * padding) / gardenWidthFt,
        (height * padding) / gardenHeightFt,
      );
      useUiStore.getState().setZoom(fitZoom);
      const gardenW = gardenWidthFt * fitZoom;
      const gardenH = gardenHeightFt * fitZoom;
      setPan((width - gardenW) / 2, (height - gardenH) / 2);
    }
  }, [width, height, gardenWidthFt, gardenHeightFt, setPan]);
}
