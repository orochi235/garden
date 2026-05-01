/** Convert client coords to canvas-buffer coords, accounting for any
 *  CSS scaling between the canvas attribute size and its rendered size. */
export function clientToCanvas(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  return [(clientX - rect.left) * sx, (clientY - rect.top) * sy];
}
