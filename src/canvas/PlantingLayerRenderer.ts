import type { Planting, Structure, Zone } from '../model/types';
import type { LabelMode } from '../store/uiStore';
import { LayerRenderer } from './LayerRenderer';
import { buildPlantingLayerData, PLANTING_LAYERS } from './layers/plantingLayers';
import { runLayers } from './renderLayer';
import { renderOverlayPlantings } from './renderPlantings';

export class PlantingLayerRenderer extends LayerRenderer {
  plantings: Planting[] = [];
  zones: Zone[] = [];
  structures: Structure[] = [];
  selectedIds: string[] = [];
  labelMode: LabelMode | 'none' = 'none';
  labelFontSize = 13;
  plantIconScale = 1;
  hideIds: string[] = [];
  overlayPlantings: Planting[] = [];
  overlaySnapped: boolean = false;
  renderLayerVisibility: Record<string, boolean> = {};
  renderLayerOrder?: string[];

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visiblePlantings = this.hideIds.length > 0
      ? this.plantings.filter((p) => !this.hideIds.includes(p.id))
      : this.plantings;

    const data = buildPlantingLayerData(
      visiblePlantings, this.zones, this.structures,
      this.view, this.width, this.height, this.highlight,
      this.labelMode, this.labelFontSize, this.selectedIds, this.plantIconScale,
    );

    runLayers(ctx, PLANTING_LAYERS, data, this.renderLayerVisibility, this.renderLayerOrder);

    if (this.overlayPlantings.length > 0) {
      renderOverlayPlantings(ctx, this.overlayPlantings, this.zones, this.structures, {
        view: this.view,
        snapped: this.overlaySnapped,
      });
    }
  }
}
