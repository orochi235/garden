import { useRef } from 'react';

export interface ActivePan {
  x: number;
  y: number;
  setPan: (x: number, y: number) => void;
}

/**
 * Pan-on-drag interaction. The caller supplies `getActive`, which is read
 * at pan-start so the appropriate viewport is captured for the duration of
 * the gesture (useful when the app has multiple viewports — e.g. a main
 * canvas plus a separate seed-starting view).
 */
export function usePanInteraction(getActive: () => ActivePan) {
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
