import type { Zone } from '../model/types';
import { LayerRenderer } from './LayerRenderer';
import { renderZones } from './renderZones';

export class ZoneLayerRenderer extends LayerRenderer {
  zones: Zone[] = [];
  showLabels = false;
  hideIds: string[] = [];
  overlayZones: Zone[] = [];
  overlaySnapped: boolean = false;

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visibleZones = this.hideIds.length > 0
      ? this.zones.filter((z) => !this.hideIds.includes(z.id))
      : this.zones;
    renderZones(
      ctx,
      visibleZones,
      this.view,
      this.width,
      this.height,
      this.highlight,
      null,
      false,
      this.showLabels,
    );
    if (this.overlayZones.length > 0) {
      ctx.save();
      if (this.overlaySnapped) ctx.globalAlpha = 0.4;
      renderZones(ctx, this.overlayZones, this.view, this.width, this.height, 0, null, true);
      ctx.restore();
    }
  }
}
