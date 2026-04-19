import { useEffect, type RefObject } from 'react';

export function useLayerEffect(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  width: number,
  height: number,
  dpr: number,
  visible: boolean,
  renderFn: (ctx: CanvasRenderingContext2D) => void,
  deps: unknown[],
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    if (visible) {
      renderFn(ctx);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, width, height, dpr, visible, ...deps]);
}
