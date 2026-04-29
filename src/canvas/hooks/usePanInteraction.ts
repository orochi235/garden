import { useRef } from 'react';
import { useUiStore } from '../../store/uiStore';

export interface PanInteractionOptions {
  getPan?: () => { x: number; y: number };
  getSetPan?: () => (x: number, y: number) => void;
}

export function usePanInteraction(
  setPan: (x: number, y: number) => void,
  options: PanInteractionOptions = {},
) {
  const isPanning = useRef(false);
  const panStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });
  const activeSetPan = useRef<(x: number, y: number) => void>(setPan);

  function start(e: React.MouseEvent) {
    isPanning.current = true;
    const cur = options.getPan
      ? options.getPan()
      : { x: useUiStore.getState().panX, y: useUiStore.getState().panY };
    activeSetPan.current = options.getSetPan ? options.getSetPan() : setPan;
    panStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: cur.x,
      panY: cur.y,
    };
  }

  function move(e: React.MouseEvent) {
    if (!isPanning.current) return false;
    const dx = e.clientX - panStart.current.mouseX;
    const dy = e.clientY - panStart.current.mouseY;
    activeSetPan.current(panStart.current.panX + dx, panStart.current.panY + dy);
    return true;
  }

  function end() {
    isPanning.current = false;
  }

  return { start, move, end, isPanning };
}
