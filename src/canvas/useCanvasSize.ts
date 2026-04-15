import { useEffect, useState, useCallback, type RefObject } from 'react';

interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
}

export function useCanvasSize(containerRef: RefObject<HTMLDivElement | null>): CanvasSize {
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0, dpr: 1 });

  const measure = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setSize({
      width: rect.width,
      height: rect.height,
      dpr: window.devicePixelRatio || 1,
    });
  }, [containerRef]);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [measure, containerRef]);

  return size;
}
