import type { Planting, Structure, Zone } from '../model/types';
import type { LabelMode } from '../store/uiStore';
import { LayerRenderer } from './LayerRenderer';
import { renderOverlayPlantings, renderPlantings } from './renderPlantings';

export class PlantingLayerRenderer extends LayerRenderer {
  plantings: Planting[] = [];
  zones: Zone[] = [];
  structures: Structure[] = [];
  selectedIds: string[] = [];
  showSpacing: boolean = false;
  labelMode: LabelMode | 'none' = 'none';
  labelFontSize = 13;
  plantIconScale = 1;
  hideIds: string[] = [];
  overlayPlantings: Planting[] = [];
  overlaySnapped: boolean = false;

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visiblePlantings = this.hideIds.length > 0
      ? this.plantings.filter((p) => !this.hideIds.includes(p.id))
      : this.plantings;
    renderPlantings(ctx, visiblePlantings, this.zones, this.structures, {
      view: this.view,
      canvasWidth: this.width,
      canvasHeight: this.height,
      highlightOpacity: this.highlight,
      selectedIds: this.selectedIds,
      showSpacing: this.showSpacing,
      labelMode: this.labelMode,
      labelFontSize: this.labelFontSize,
      plantIconScale: this.plantIconScale,
    });
    if (this.overlayPlantings.length > 0) {
      renderOverlayPlantings(ctx, this.overlayPlantings, this.zones, this.structures, {
        view: this.view,
        snapped: this.overlaySnapped,
      });
    }
  }
}
