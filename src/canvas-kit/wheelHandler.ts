/** Pure viewport state consumed and returned by `computeWheelAction`. */
export interface WheelState {
  zoom: number;
  panX: number;
  panY: number;
}

/** Wheel-event input, decoupled from the DOM `WheelEvent` shape for testability. */
export interface WheelInput {
  deltaX: number;
  deltaY: number;
  mouseX: number;
  mouseY: number;
  shiftKey?: boolean;
  metaKey?: boolean;
}

const MIN_ZOOM = 10;
const MAX_ZOOM = 200;

/** Inclusive `[min, max]` zoom clamp for `computeWheelAction`. */
export interface ZoomBounds { min: number; max: number; }

/** Pure reducer: given current viewport state and a wheel input, return the next state (zoom, pan, or scroll). */
export function computeWheelAction(
  state: WheelState,
  input: WheelInput,
  bounds: ZoomBounds = { min: MIN_ZOOM, max: MAX_ZOOM },
): WheelState {
  // Shift+wheel scrolls horizontally
  if (input.shiftKey) {
    return {
      zoom: state.zoom,
      panX: state.panX - input.deltaY,
      panY: state.panY,
    };
  }

  // Cmd+wheel scrolls vertically
  if (input.metaKey) {
    return {
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY - input.deltaY,
    };
  }

  const factor = input.deltaY < 0 ? 1.1 : 0.9;
  const newZoom = Math.min(bounds.max, Math.max(bounds.min, state.zoom * factor));
  const worldX = (input.mouseX - state.panX) / state.zoom;
  const worldY = (input.mouseY - state.panY) / state.zoom;
  return {
    zoom: newZoom,
    panX: input.mouseX - worldX * newZoom,
    panY: input.mouseY - worldY * newZoom,
  };
}
