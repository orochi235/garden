import type { Tray } from '../model/seedStarting';
import { LayerRenderer } from '@/canvas-kit';
import { renderTrayBase, type DragSpreadAffordanceHover } from './layers/trayLayers';

export class TrayLayerRenderer extends LayerRenderer {
  tray: Tray | null = null;
  pxPerInch = 30;
  originX = 0;
  originY = 0;
  showGrid = true;
  showDragSpreadAffordances = false;
  dragSpreadAffordanceHover: DragSpreadAffordanceHover = null;

  protected draw(ctx: CanvasRenderingContext2D): void {
    if (!this.tray) return;
    renderTrayBase(ctx, this.tray, this.pxPerInch, this.originX, this.originY, {
      showGrid: this.showGrid,
      showDragSpreadAffordances: this.showDragSpreadAffordances,
      dragSpreadAffordanceHover: this.dragSpreadAffordanceHover,
    });
  }
}
