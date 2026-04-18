import { useRef } from 'react';
import { useUiStore } from '../../store/uiStore';

export function usePanInteraction(setPan: (x: number, y: number) => void) {
  const isPanning = useRef(false);
  const panStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

  function start(e: React.MouseEvent) {
    isPanning.current = true;
    panStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: useUiStore.getState().panX,
      panY: useUiStore.getState().panY,
    };
  }

  function move(e: React.MouseEvent) {
    if (!isPanning.current) return false;
    const dx = e.clientX - panStart.current.mouseX;
    const dy = e.clientY - panStart.current.mouseY;
    setPan(panStart.current.panX + dx, panStart.current.panY + dy);
    return true;
  }

  function end() {
    isPanning.current = false;
  }

  return { start, move, end, isPanning };
}
