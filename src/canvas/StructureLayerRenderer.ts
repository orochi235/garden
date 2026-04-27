import type { Structure } from '../model/types';
import type { LabelMode } from '../store/uiStore';
import { LayerRenderer } from './LayerRenderer';
import type { StructureLayerData } from './layerData';
import { buildStructureRenderQueue, STRUCTURE_LAYERS } from './layers/structureLayers';
import { runLayers } from './renderLayer';
import { renderStructures } from './renderStructures';

export class StructureLayerRenderer extends LayerRenderer {
  structures: Structure[] = [];
  debugOverlappingLabels = false;
  labelMode: LabelMode | 'none' = 'none';
  labelFontSize = 13;
  hideIds: string[] = [];
  overlayStructures: Structure[] = [];
  overlaySnapped: boolean = false;
  renderLayerVisibility: Record<string, boolean> = {};
  renderLayerOrder?: string[];

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visibleStructures = this.hideIds.length > 0
      ? this.structures.filter((s) => !this.hideIds.includes(s.id))
      : this.structures;

    const { renderQueue, groups } = buildStructureRenderQueue(visibleStructures);

    const data: StructureLayerData = {
      view: this.view,
      canvasWidth: this.width,
      canvasHeight: this.height,
      highlightOpacity: this.highlight,
      labelMode: this.labelMode,
      labelFontSize: this.labelFontSize,
      structures: visibleStructures,
      groups,
      ungrouped: visibleStructures.filter((s) => !s.groupId),
      renderQueue,
      debugOverlappingLabels: this.debugOverlappingLabels,
    };

    runLayers(ctx, STRUCTURE_LAYERS, data, this.renderLayerVisibility, this.renderLayerOrder);

    if (this.overlayStructures.length > 0) {
      ctx.save();
      if (this.overlaySnapped) ctx.globalAlpha = 0.4;
      renderStructures(ctx, this.overlayStructures, {
        view: this.view,
        canvasWidth: this.width,
        canvasHeight: this.height,
        showSurfaces: this.renderLayerVisibility['structure-surfaces'] ?? true,
        skipClear: true,
      });
      ctx.restore();
    }
  }
}
