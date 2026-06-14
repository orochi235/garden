import type { LayoutStrategy } from '../types';
import { freeFormStrategy } from './free-form';
import { quadtreeStrategy } from './quadtree';
import { snapPointStrategy } from './snap-point';
import { subgridStrategy } from './subgrid';

export const strategies: Record<string, LayoutStrategy> = {
  'Free-form': freeFormStrategy,
  'Tile grid': subgridStrategy,
  'Snap-point': snapPointStrategy,
  Quadtree: quadtreeStrategy,
};

export const strategyNames = Object.keys(strategies);

export function getStrategy(name: string): LayoutStrategy {
  return strategies[name] ?? freeFormStrategy;
}
