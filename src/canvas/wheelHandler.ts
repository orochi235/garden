import type { ViewMode } from '../store/uiStore';

export interface WheelState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface WheelInput {
  deltaX: number;
  deltaY: number;
  mouseX: number;
  mouseY: number;
}

const MIN_ZOOM = 10;
const MAX_ZOOM = 200;

export function computeWheelAction(
  mode: ViewMode,
  state: WheelState,
  input: WheelInput,
): WheelState {
  switch (mode) {
    case 'pan':
    case 'select': {
      return {
        zoom: state.zoom,
        panX: state.panX - input.deltaX,
        panY: state.panY - input.deltaY,
      };
    }
    case 'zoom': {
      const factor = input.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom * factor));

      const worldX = (input.mouseX - state.panX) / state.zoom;
      const worldY = (input.mouseY - state.panY) / state.zoom;

      return {
        zoom: newZoom,
        panX: input.mouseX - worldX * newZoom,
        panY: input.mouseY - worldY * newZoom,
      };
    }
  }
}
