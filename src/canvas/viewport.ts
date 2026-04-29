import { useUiStore } from '../store/uiStore';

export interface ViewportControls {
  zoom: number;
  panX: number;
  panY: number;
  bounds: { min: number; max: number };
  setZoom: (z: number) => void;
  setPan: (x: number, y: number) => void;
}

/** Returns zoom/pan accessors and bounds for the active app mode. */
export function getActiveViewport(): ViewportControls {
  const s = useUiStore.getState();
  if (s.appMode === 'seed-starting') {
    return {
      zoom: s.seedStartingZoom,
      panX: s.seedStartingPanX,
      panY: s.seedStartingPanY,
      bounds: { min: 5, max: 100 },
      setZoom: s.setSeedStartingZoom,
      setPan: s.setSeedStartingPan,
    };
  }
  return {
    zoom: s.zoom,
    panX: s.panX,
    panY: s.panY,
    bounds: { min: 10, max: 200 },
    setZoom: s.setZoom,
    setPan: s.setPan,
  };
}
