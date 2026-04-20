import type { Structure } from '../model/types';
import { LayerRenderer } from './LayerRenderer';
import { renderStructures } from './renderStructures';

export class StructureLayerRenderer extends LayerRenderer {
  structures: Structure[] = [];
  showSurfaces = false;

  protected draw(ctx: CanvasRenderingContext2D): void {
    renderStructures(
      ctx,
      this.structures,
      this.view,
      this.width,
      this.height,
      this.highlight,
      this.showSurfaces,
    );
  }
}
