import type { LayoutStrategy } from '../types';
import { freeFormStrategy } from './free-form';
import { slotBasedStrategy } from './slot-based';
import { subgridStrategy } from './subgrid';
import { snapPointStrategy } from './snap-point';

export const strategies: Record<string, LayoutStrategy> = {
  'Free-form': freeFormStrategy,
  'Slot-based': slotBasedStrategy,
  'Subgrid': subgridStrategy,
  'Snap-point': snapPointStrategy,
};

export const strategyNames = Object.keys(strategies);

export function getStrategy(name: string): LayoutStrategy {
  return strategies[name] ?? freeFormStrategy;
}
