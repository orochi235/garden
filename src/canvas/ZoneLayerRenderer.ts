import type { Zone } from '../model/types';
import { LayerRenderer } from './LayerRenderer';
import { renderZones } from './renderZones';

export class ZoneLayerRenderer extends LayerRenderer {
  zones: Zone[] = [];
  hideIds: string[] = [];

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
    );
  }
}
