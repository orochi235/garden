import type { Zone } from '../model/types';
import { LayerRenderer } from './LayerRenderer';
import { renderZones } from './renderZones';

export class ZoneLayerRenderer extends LayerRenderer {
  zones: Zone[] = [];

  protected draw(ctx: CanvasRenderingContext2D): void {
    renderZones(
      ctx,
      this.zones,
      this.view,
      this.width,
      this.height,
      this.highlight,
    );
  }
}
