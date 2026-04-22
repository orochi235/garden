import type { Structure } from '../model/types';
import { LayerRenderer } from './LayerRenderer';
import { renderStructures } from './renderStructures';

export class StructureLayerRenderer extends LayerRenderer {
  structures: Structure[] = [];
  showSurfaces = false;
  hideIds: string[] = [];

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
  }
}
