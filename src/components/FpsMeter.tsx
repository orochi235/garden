import { useEffect, useRef, useState } from 'react';

export function FpsMeter() {
  const [fps, setFps] = useState(0);
  const [visible, setVisible] = useState(true);
  const frames = useRef<number[]>([]);
  const rafId = useRef<number>(0);

  useEffect(() => {
    function tick(now: number) {
      frames.current.push(now);
      // Keep last 1 second of frame timestamps
      const cutoff = now - 1000;
      while (frames.current.length > 0 && frames.current[0] < cutoff) {
        frames.current.shift();
      }
      setFps(frames.current.length);
      rafId.current = requestAnimationFrame(tick);
    }

    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'F' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setVisible((v) => !v);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.7)',
        color: fps >= 55 ? '#4f4' : fps >= 30 ? '#ff4' : '#f44',
        padding: '4px 8px',
        borderRadius: 4,
        fontFamily: 'monospace',
        fontSize: 12,
        fontWeight: 600,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {fps} fps
    </div>
  );
}
