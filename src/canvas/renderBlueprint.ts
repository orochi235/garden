import type { Blueprint } from '../model/types';
import type { ViewTransform } from '../utils/grid';
import { worldToScreen } from '../utils/grid';

const imageCache = new Map<string, HTMLImageElement>();

function getImage(dataUri: string): HTMLImageElement | null {
  if (imageCache.has(dataUri)) {
    const img = imageCache.get(dataUri)!;
    return img.complete ? img : null;
  }
  const img = new Image();
  img.src = dataUri;
  imageCache.set(dataUri, img);
  img.onload = () => {
    window.dispatchEvent(new CustomEvent('blueprint-loaded'));
  };
  return null;
}

export function renderBlueprint(
  ctx: CanvasRenderingContext2D,
  blueprint: Blueprint | null,
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  layerOpacity: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (!blueprint) return;
  const img = getImage(blueprint.imageData);
  if (!img) return;
  ctx.globalAlpha = blueprint.opacity * layerOpacity;
  const [sx, sy] = worldToScreen(blueprint.x, blueprint.y, view);
  const imgW = (img.naturalWidth / 96) * blueprint.scale * view.zoom;
  const imgH = (img.naturalHeight / 96) * blueprint.scale * view.zoom;
  ctx.drawImage(img, sx, sy, imgW, imgH);
  ctx.globalAlpha = 1;
}
