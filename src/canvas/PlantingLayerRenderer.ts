import type { Planting, Structure, Zone } from '../model/types';
import { LayerRenderer } from './LayerRenderer';
import { renderPlantings, type GhostPlanting } from './renderPlantings';

export class PlantingLayerRenderer extends LayerRenderer {
  plantings: Planting[] = [];
  zones: Zone[] = [];
  structures: Structure[] = [];
  selectedIds: string[] = [];
  showSpacing: boolean = false;
  ghost: GhostPlanting | null = null;
  hideIds: string[] = [];

  protected draw(ctx: CanvasRenderingContext2D): void {
    const visiblePlantings = this.hideIds.length > 0
      ? this.plantings.filter((p) => !this.hideIds.includes(p.id))
      : this.plantings;
    renderPlantings(
      ctx,
      visiblePlantings,
      this.zones,
      this.structures,
      this.view,
      this.width,
      this.height,
      this.highlight,
      this.selectedIds,
      this.showSpacing,
      this.ghost,
    );
  }
}
