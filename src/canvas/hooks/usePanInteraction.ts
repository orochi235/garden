import { useRef } from 'react';
import { useUiStore } from '../../store/uiStore';

export interface ActivePan {
  x: number;
  y: number;
  setPan: (x: number, y: number) => void;
}

/**
 * Returns the active pan state for the current app mode. Read at pan-start
 * so the appropriate pan target is captured for the duration of the gesture.
 */
export function getActivePan(): ActivePan {
  const s = useUiStore.getState();
  if (s.appMode === 'seed-starting') {
    return { x: s.seedStartingPanX, y: s.seedStartingPanY, setPan: s.setSeedStartingPan };
  }
  return { x: s.panX, y: s.panY, setPan: s.setPan };
}

export function usePanInteraction(getActive: () => ActivePan = getActivePan) {
  const isPanning = useRef(false);
  const panStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });
  const activeSetPan = useRef<(x: number, y: number) => void>(() => {});

  function start(e: React.MouseEvent) {
    isPanning.current = true;
    const cur = getActive();
    activeSetPan.current = cur.setPan;
    panStart.current = { mouseX: e.clientX, mouseY: e.clientY, panX: cur.x, panY: cur.y };
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
