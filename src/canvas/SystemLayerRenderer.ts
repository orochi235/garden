import type { Planting, Structure, Zone } from '../model/types';
import { LayerRenderer } from './LayerRenderer';
import type { SystemLayerData } from './layerData';
import { SELECTION_LAYERS } from './layers/selectionLayers';
import { runLayers } from './renderLayer';

export class SystemLayerRenderer extends LayerRenderer {
  selectedIds: string[] = [];
  structures: Structure[] = [];
  zones: Zone[] = [];
  plantings: Planting[] = [];
  renderLayerVisibility: Record<string, boolean> = {};
  renderLayerOrder?: string[];

  protected draw(ctx: CanvasRenderingContext2D): void {
    const data: SystemLayerData = {
      selectedIds: this.selectedIds,
      structures: this.structures,
      zones: this.zones,
      plantings: this.plantings,
      view: this.view,
      canvasWidth: this.width,
      canvasHeight: this.height,
    };
    runLayers(ctx, SELECTION_LAYERS, data, this.renderLayerVisibility, this.renderLayerOrder);
  }
}
