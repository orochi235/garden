import { useUiStore } from '../store/uiStore';
import { useGardenStore } from '../store/gardenStore';

/** Returns true when the entire garden is outside the visible canvas area. */
export function useGardenOffscreen(canvasWidth: number, canvasHeight: number): boolean {
  const panX = useUiStore((s) => s.panX);
  const panY = useUiStore((s) => s.panY);
  const zoom = useUiStore((s) => s.zoom);
  const widthFt = useGardenStore((s) => s.garden.widthFt);
  const heightFt = useGardenStore((s) => s.garden.heightFt);

  const gardenRight = panX + widthFt * zoom;
  const gardenBottom = panY + heightFt * zoom;

  return gardenRight < 0 || panX > canvasWidth || gardenBottom < 0 || panY > canvasHeight;
}
