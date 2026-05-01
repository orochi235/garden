import type { Seedling, Tray } from '../model/seedStarting';
import type { useUiStore } from '../store/uiStore';
import { LayerRenderer } from '@orochi235/weasel';
import { renderSeedlings } from './layers/seedlingLayers';

type FillPreview = ReturnType<typeof useUiStore.getState>['seedFillPreview'];
type MovePreview = ReturnType<typeof useUiStore.getState>['seedMovePreview'];

export class SeedlingLayerRenderer extends LayerRenderer {
  tray: Tray | null = null;
  seedlings: Seedling[] = [];
  pxPerInch = 30;
  originX = 0;
  originY = 0;
  showLabel = false;
  showWarnings = true;
  selectedIds: string[] = [];
  fillPreview: FillPreview = null;
  movePreview: MovePreview = null;
  hiddenSeedlingIds: string[] = [];

  protected draw(ctx: CanvasRenderingContext2D): void {
    if (!this.tray) {
      ctx.fillStyle = '#888';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        'No tray selected. Use the Tray menu to create one.',
        this.width / 2,
        this.height / 2,
      );
      return;
    }
    const tray = this.tray;
    const fp = this.fillPreview && this.fillPreview.trayId === tray.id ? this.fillPreview : null;
    const mp = this.movePreview && this.movePreview.trayId === tray.id ? this.movePreview : null;

    renderSeedlings(ctx, tray, this.seedlings, this.pxPerInch, this.originX, this.originY, {
      showLabel: this.showLabel,
      showWarnings: this.showWarnings,
      selectedIds: this.selectedIds,
      fillPreviewCultivarId: fp?.cultivarId ?? null,
      fillPreviewScope: fp?.scope,
      fillPreviewIndex:
        fp?.scope === 'row' || fp?.scope === 'col' ? fp.index : undefined,
      fillPreviewRow: fp?.scope === 'cell' ? fp.row : undefined,
      fillPreviewCol: fp?.scope === 'cell' ? fp.col : undefined,
      fillPreviewReplace: fp?.replace ?? false,
      hiddenSeedlingIds: this.hiddenSeedlingIds,
      movePreview: mp ? { cells: mp.cells, feasible: mp.feasible } : null,
    });
  }
}
