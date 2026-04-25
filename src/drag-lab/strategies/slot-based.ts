// src/drag-lab/strategies/slot-based.ts
import type { LabItem, LayoutStrategy, Rect, ContainerShape, Point, ConfigField, DragFeedback, DropResult } from '../types';
import { computeSlots, defaultArrangement, type Arrangement, type ArrangementType, type ParentBounds, type Slot } from '@/model/arrangement';

function toBounds(rect: Rect, shape: ContainerShape): ParentBounds {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, shape };
}

function buildArrangement(config: Record<string, unknown>): Arrangement {
  const type = (config.arrangementType as ArrangementType) ?? 'rows';
  const base = defaultArrangement(type);
  if (base.type === 'rows') {
    return {
      ...base,
      spacingFt: (config.spacingFt as number) ?? base.spacingFt,
      itemSpacingFt: (config.itemSpacingFt as number) ?? base.itemSpacingFt,
      marginFt: (config.marginFt as number) ?? base.marginFt,
    };
  }
  if (base.type === 'grid') {
    return {
      ...base,
      spacingXFt: (config.spacingXFt as number) ?? base.spacingXFt,
      spacingYFt: (config.spacingYFt as number) ?? base.spacingYFt,
      marginFt: (config.marginFt as number) ?? base.marginFt,
    };
  }
  if (base.type === 'ring') {
    return {
      ...base,
      count: (config.ringCount as number) ?? base.count,
      marginFt: (config.marginFt as number) ?? base.marginFt,
    };
  }
  return base;
}

function nearestUnoccupiedSlot(slots: Slot[], pos: Point, occupied: LabItem[]): Slot | null {
  const occupiedSet = new Set(occupied.map((i) => `${i.x},${i.y}`));
  let best: Slot | null = null;
  let bestDist = Infinity;
  for (const slot of slots) {
    if (occupiedSet.has(`${slot.x},${slot.y}`)) continue;
    const d = (slot.x - pos.x) ** 2 + (slot.y - pos.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = slot;
    }
  }
  return best;
}

function renderSlots(ctx: CanvasRenderingContext2D, slots: Slot[], occupied: LabItem[]): void {
  const occupiedSet = new Set(occupied.map((i) => `${i.x},${i.y}`));
  for (const slot of slots) {
    ctx.beginPath();
    ctx.arc(slot.x, slot.y, 0.06, 0, Math.PI * 2);
    ctx.fillStyle = occupiedSet.has(`${slot.x},${slot.y}`) ? 'rgba(255,255,255,0.1)' : 'rgba(127,176,105,0.4)';
    ctx.fill();
  }
}

export const slotBasedStrategy: LayoutStrategy = {
  name: 'Slot-based',

  render(ctx, bounds, shape, items, config) {
    const arrangement = buildArrangement(config);
    const slots = computeSlots(arrangement, toBounds(bounds, shape));
    renderSlots(ctx, slots, items);
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

  onDragOver(bounds, shape, pos, items, config): DragFeedback | null {
    const arrangement = buildArrangement(config);
    const slots = computeSlots(arrangement, toBounds(bounds, shape));
    const target = nearestUnoccupiedSlot(slots, pos, items);
    if (!target) return null;
    return {
      render(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        ctx.arc(target.x, target.y, 0.15, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(127,176,105,0.8)';
        ctx.lineWidth = 0.04;
        ctx.stroke();
      },
    };
  },

  onDrop(bounds, shape, pos, item, items, config): DropResult {
    const arrangement = buildArrangement(config);
    const slots = computeSlots(arrangement, toBounds(bounds, shape));
    const target = nearestUnoccupiedSlot(slots, pos, items);
    if (!target) return { item: { ...item, x: pos.x, y: pos.y }, state: {} };
    return { item: { ...item, x: target.x, y: target.y }, state: {} };
  },

  defaultConfig() {
    return {
      arrangementType: 'rows' as string,
      spacingFt: 0.5,
      itemSpacingFt: 0.5,
      spacingXFt: 0.5,
      spacingYFt: 0.5,
      marginFt: 0.25,
      ringCount: 6,
    };
  },

  configSchema(): ConfigField[] {
    return [
      {
        key: 'arrangementType',
        label: 'Arrangement',
        type: 'dropdown' as const,
        options: [
          { label: 'Rows', value: 'rows' },
          { label: 'Grid', value: 'grid' },
          { label: 'Ring', value: 'ring' },
          { label: 'Single', value: 'single' },
        ],
        default: 'rows',
      },
      { key: 'spacingFt', label: 'Row Spacing (ft)', type: 'slider' as const, min: 0.1, max: 2, step: 0.05, default: 0.5 },
      { key: 'itemSpacingFt', label: 'Item Spacing (ft)', type: 'slider' as const, min: 0.1, max: 2, step: 0.05, default: 0.5 },
      { key: 'spacingXFt', label: 'Grid X Spacing (ft)', type: 'slider' as const, min: 0.1, max: 2, step: 0.05, default: 0.5 },
      { key: 'spacingYFt', label: 'Grid Y Spacing (ft)', type: 'slider' as const, min: 0.1, max: 2, step: 0.05, default: 0.5 },
      { key: 'marginFt', label: 'Margin (ft)', type: 'slider' as const, min: 0, max: 1, step: 0.05, default: 0.25 },
      { key: 'ringCount', label: 'Ring Count', type: 'slider' as const, min: 1, max: 20, step: 1, default: 6 },
    ];
  },
};
