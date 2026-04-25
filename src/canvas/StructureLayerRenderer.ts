import type { Structure } from '../model/types';
import type { LabelMode } from '../store/uiStore';
import { LayerRenderer } from './LayerRenderer';
import { renderStructures } from './renderStructures';

export class StructureLayerRenderer extends LayerRenderer {
  structures: Structure[] = [];
  showSurfaces = false;
  showPlantableArea = false;
  labelMode: LabelMode | 'none' = 'none';
  labelFontSize = 13;
  hideIds: string[] = [];
  overlayStructures: Structure[] = [];
  overlaySnapped: boolean = false;

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visibleStructures = this.hideIds.length > 0
      ? this.structures.filter((s) => !this.hideIds.includes(s.id))
      : this.structures;
    renderStructures(ctx, visibleStructures, {
      view: this.view,
      canvasWidth: this.width,
      canvasHeight: this.height,
      highlightOpacity: this.highlight,
      showSurfaces: this.showSurfaces,
      showPlantableArea: this.showPlantableArea,
      labelMode: this.labelMode,
      labelFontSize: this.labelFontSize,
    });
    if (this.overlayStructures.length > 0) {
      ctx.save();
      if (this.overlaySnapped) ctx.globalAlpha = 0.4;
      renderStructures(ctx, this.overlayStructures, {
        view: this.view,
        canvasWidth: this.width,
        canvasHeight: this.height,
        showSurfaces: this.showSurfaces,
        skipClear: true,
      });
      ctx.restore();
    }
  }
}
