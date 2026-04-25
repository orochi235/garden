import type { LabItem, LayoutStrategy, Rect, ContainerShape, Point, ConfigField, DragFeedback, DropResult } from '../types';

export const freeFormStrategy: LayoutStrategy = {
  name: 'Free-form',

  render(ctx: CanvasRenderingContext2D, _bounds: Rect, _shape: ContainerShape, items: LabItem[], _config: Record<string, unknown>): void {
    for (const item of items) {
      ctx.beginPath();
      ctx.arc(item.x, item.y, item.radiusFt, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.02;
      ctx.stroke();
    }
  },

  onDragOver(_bounds: Rect, _shape: ContainerShape, _pos: Point, _items: LabItem[], _config: Record<string, unknown>): DragFeedback | null {
    return null;
  },

  onDrop(_bounds: Rect, _shape: ContainerShape, pos: Point, item: LabItem, _items: LabItem[], _config: Record<string, unknown>): DropResult {
    return {
      item: { ...item, x: pos.x, y: pos.y },
      state: {},
    };
  },

  defaultConfig(): Record<string, unknown> {
    return {};
  },

  configSchema(): ConfigField[] {
    return [];
  },
};
