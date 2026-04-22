import type { Structure } from '../model/types';
import { LayerRenderer } from './LayerRenderer';
import { renderStructures } from './renderStructures';

export class StructureLayerRenderer extends LayerRenderer {
  structures: Structure[] = [];
  showSurfaces = false;
  hideIds: string[] = [];
  overlayStructures: Structure[] = [];
  overlaySnapped: boolean = false;

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visibleStructures = this.hideIds.length > 0
      ? this.structures.filter((s) => !this.hideIds.includes(s.id))
      : this.structures;
    renderStructures(
      ctx,
      visibleStructures,
      this.view,
      this.width,
      this.height,
      this.highlight,
      this.showSurfaces,
    );
    if (this.overlayStructures.length > 0) {
      ctx.save();
      if (this.overlaySnapped) ctx.globalAlpha = 0.4;
      renderStructures(ctx, this.overlayStructures, this.view, this.width, this.height, 0, this.showSurfaces, true);
      ctx.restore();
    }
  }
}
