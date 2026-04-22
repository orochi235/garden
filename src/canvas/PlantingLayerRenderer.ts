import type { Planting, Structure, Zone } from '../model/types';
import { LayerRenderer } from './LayerRenderer';
import { renderOverlayPlantings, renderPlantings } from './renderPlantings';

export class PlantingLayerRenderer extends LayerRenderer {
  plantings: Planting[] = [];
  zones: Zone[] = [];
  structures: Structure[] = [];
  selectedIds: string[] = [];
  showSpacing: boolean = false;
  hideIds: string[] = [];
  overlayPlantings: Planting[] = [];
  overlaySnapped: boolean = false;

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visiblePlantings = this.hideIds.length > 0
      ? this.plantings.filter((p) => !this.hideIds.includes(p.id))
      : this.plantings;
    renderPlantings(
      ctx,
      visiblePlantings,
      this.zones,
      this.structures,
      this.view,
      this.width,
      this.height,
      this.highlight,
      this.selectedIds,
      this.showSpacing,
    );
    if (this.overlayPlantings.length > 0) {
      renderOverlayPlantings(ctx, this.overlayPlantings, this.zones, this.structures, this.view, this.overlaySnapped);
    }
  }
}
