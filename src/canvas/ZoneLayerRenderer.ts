import type { Zone } from '../model/types';
import type { LabelMode } from '../store/uiStore';
import { LayerRenderer } from './LayerRenderer';
import { renderZones } from './renderZones';
import type { ZoneLayerData } from './layerData';
import { ZONE_LAYERS } from './layers/zoneLayers';
import { runLayers } from './renderLayer';

export class ZoneLayerRenderer extends LayerRenderer {
  zones: Zone[] = [];
  labelMode: LabelMode | 'none' = 'none';
  labelFontSize = 13;
  hideIds: string[] = [];
  overlayZones: Zone[] = [];
  overlaySnapped: boolean = false;
  renderLayerVisibility: Record<string, boolean> = {};
  renderLayerOrder?: string[];

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visibleZones = this.hideIds.length > 0
      ? this.zones.filter((z) => !this.hideIds.includes(z.id))
      : this.zones;

    const data: ZoneLayerData = {
      view: this.view,
      canvasWidth: this.width,
      canvasHeight: this.height,
      highlightOpacity: this.highlight,
      labelMode: this.labelMode,
      labelFontSize: this.labelFontSize,
      zones: visibleZones,
    };

    runLayers(ctx, ZONE_LAYERS, data, this.renderLayerVisibility, this.renderLayerOrder);

    if (this.overlayZones.length > 0) {
      ctx.save();
      if (this.overlaySnapped) ctx.globalAlpha = 0.4;
      renderZones(ctx, this.overlayZones, {
        view: this.view,
        canvasWidth: this.width,
        canvasHeight: this.height,
        skipClear: true,
      });
      ctx.restore();
    }
  }
}
