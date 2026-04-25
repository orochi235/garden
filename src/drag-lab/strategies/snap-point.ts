// src/drag-lab/strategies/snap-point.ts
import type { LabItem, LayoutStrategy, Rect, ContainerShape, Point, ConfigField, DragFeedback, DropResult } from '../types';

type PatternType = 'corners' | 'edges' | 'center' | 'grid';

function generatePoints(bounds: Rect, pattern: PatternType, gridSpacing: number): Point[] {
  const { x, y, width: w, height: h } = bounds;
  switch (pattern) {
    case 'corners':
      return [{ x, y }, { x: x + w, y }, { x, y: y + h }, { x: x + w, y: y + h }];
    case 'edges': {
      const pts: Point[] = [];
      const step = gridSpacing || 0.5;
      for (let px = x; px <= x + w; px += step) { pts.push({ x: px, y }); pts.push({ x: px, y: y + h }); }
      for (let py = y + step; py < y + h; py += step) { pts.push({ x, y: py }); pts.push({ x: x + w, y: py }); }
      return pts;
    }
    case 'center':
      return [{ x: x + w / 2, y: y + h / 2 }];
    case 'grid': {
      const pts: Point[] = [];
      const sp = gridSpacing || 0.5;
      for (let px = x + sp / 2; px < x + w; px += sp) {
        for (let py = y + sp / 2; py < y + h; py += sp) {
          pts.push({ x: px, y: py });
        }
      }
      return pts;
    }
  }
}

function nearestPoint(points: Point[], pos: Point): { point: Point; dist: number } | null {
  let best: Point | null = null;
  let bestDist = Infinity;
  for (const p of points) {
    const d = Math.sqrt((p.x - pos.x) ** 2 + (p.y - pos.y) ** 2);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best ? { point: best, dist: bestDist } : null;
}

export const snapPointStrategy: LayoutStrategy = {
  name: 'Snap-point',

  render(ctx, bounds, _shape, items, config) {
    const pattern = (config.pattern as PatternType) ?? 'grid';
    const gridSpacing = (config.gridSpacing as number) ?? 0.5;
    const points = generatePoints(bounds, pattern, gridSpacing);
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.05, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(91,164,207,0.5)';
      ctx.fill();
    }
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

  onDragOver(bounds, _shape, pos, _items, config): DragFeedback | null {
    const pattern = (config.pattern as PatternType) ?? 'grid';
    const gridSpacing = (config.gridSpacing as number) ?? 0.5;
    const threshold = (config.snapThreshold as number) ?? 0.3;
    const points = generatePoints(bounds, pattern, gridSpacing);
    const nearest = nearestPoint(points, pos);
    if (!nearest || nearest.dist > threshold) return null;
    const target = nearest.point;
    return {
      render(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        ctx.arc(target.x, target.y, 0.12, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(91,164,207,0.8)';
        ctx.lineWidth = 0.04;
        ctx.stroke();
      },
    };
  },

  onDrop(bounds, _shape, pos, item, _items, config): DropResult {
    const pattern = (config.pattern as PatternType) ?? 'grid';
    const gridSpacing = (config.gridSpacing as number) ?? 0.5;
    const threshold = (config.snapThreshold as number) ?? 0.3;
    const points = generatePoints(bounds, pattern, gridSpacing);
    const nearest = nearestPoint(points, pos);
    if (nearest && nearest.dist <= threshold) {
      return { item: { ...item, x: nearest.point.x, y: nearest.point.y }, state: {} };
    }
    return { item: { ...item, x: pos.x, y: pos.y }, state: {} };
  },

  defaultConfig() {
    return { pattern: 'grid' as string, gridSpacing: 0.5, snapThreshold: 0.3 };
  },

  configSchema(): ConfigField[] {
    return [
      {
        key: 'pattern',
        label: 'Point Pattern',
        type: 'dropdown' as const,
        options: [
          { label: 'Grid', value: 'grid' },
          { label: 'Corners', value: 'corners' },
          { label: 'Edges', value: 'edges' },
          { label: 'Center', value: 'center' },
        ],
        default: 'grid',
      },
      { key: 'gridSpacing', label: 'Grid Spacing (ft)', type: 'slider' as const, min: 0.1, max: 2, step: 0.05, default: 0.5 },
      { key: 'snapThreshold', label: 'Snap Threshold (ft)', type: 'slider' as const, min: 0.05, max: 1, step: 0.05, default: 0.3 },
    ];
  },
};
