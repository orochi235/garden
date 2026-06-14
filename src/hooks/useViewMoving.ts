import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../store/uiStore';

/** Returns true while the canvas view (pan/zoom) is actively changing, with a debounce delay. */
export function useViewMoving(delay = 200) {
  const zoom = useUiStore((s) => s.gardenZoom);
  const panX = useUiStore((s) => s.gardenPanX);
  const panY = useUiStore((s) => s.gardenPanY);
  const [moving, setMoving] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const initialRef = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: zoom/panX/panY are intentional change-triggers — the debounce fires on any view change without reading their values.
  useEffect(() => {
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }

    setMoving(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setMoving(false), delay);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [zoom, panX, panY, delay]);

  return moving;
}
