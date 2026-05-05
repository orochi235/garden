import type { Cultivar } from '../cultivars';
import type { ParentBounds, Slot, TrellisedBackConfig } from '../arrangement';
import { computeSquareFoot } from './squareFoot';
import { computeHex } from './hex';

export function computeTrellisedBack(
  config: TrellisedBackConfig,
  bounds: ParentBounds,
  cultivars?: Cultivar[],
): Slot[] {
  const m = config.marginFt;
  const trellisRect = trellisBand(bounds, config.trellisEdge, config.trellisDepthFt, m);
  const frontRect = frontBand(bounds, config.trellisEdge, config.trellisDepthFt, m);

  const trellisSlots: Slot[] = [];
  if (trellisRect && config.trellisPitchFt > 0) {
    const along = config.trellisEdge === 'N' || config.trellisEdge === 'S';
    const center = along
      ? trellisRect.y + trellisRect.height / 2
      : trellisRect.x + trellisRect.width / 2;
    const start = along ? trellisRect.x + config.trellisPitchFt / 2 : trellisRect.y + config.trellisPitchFt / 2;
    const end = along ? trellisRect.x + trellisRect.width : trellisRect.y + trellisRect.height;
    for (let p = start; p <= end; p += config.trellisPitchFt) {
      trellisSlots.push(along ? { x: p, y: center } : { x: center, y: p });
    }
  }

  const front: Slot[] = frontRect
    ? runFront(config.frontStrategy, frontRect, cultivars)
    : [];
  return [...trellisSlots, ...front];
}

function trellisBand(b: ParentBounds, edge: 'N' | 'E' | 'S' | 'W', depth: number, m: number): ParentBounds | null {
  const inner = { x: b.x + m, y: b.y + m, w: b.width - 2 * m, h: b.height - 2 * m };
  if (inner.w <= 0 || inner.h <= 0) return null;
  switch (edge) {
    case 'N': return { x: inner.x, y: inner.y, width: inner.w, height: Math.min(depth, inner.h), shape: 'rectangle' };
    case 'S': return { x: inner.x, y: inner.y + Math.max(0, inner.h - depth), width: inner.w, height: Math.min(depth, inner.h), shape: 'rectangle' };
    case 'W': return { x: inner.x, y: inner.y, width: Math.min(depth, inner.w), height: inner.h, shape: 'rectangle' };
    case 'E': return { x: inner.x + Math.max(0, inner.w - depth), y: inner.y, width: Math.min(depth, inner.w), height: inner.h, shape: 'rectangle' };
  }
}

function frontBand(b: ParentBounds, edge: 'N' | 'E' | 'S' | 'W', depth: number, m: number): ParentBounds | null {
  const inner = { x: b.x + m, y: b.y + m, w: b.width - 2 * m, h: b.height - 2 * m };
  if (inner.w <= 0 || inner.h <= 0) return null;
  switch (edge) {
    case 'N': return { x: inner.x, y: inner.y + depth, width: inner.w, height: Math.max(0, inner.h - depth), shape: 'rectangle' };
    case 'S': return { x: inner.x, y: inner.y, width: inner.w, height: Math.max(0, inner.h - depth), shape: 'rectangle' };
    case 'W': return { x: inner.x + depth, y: inner.y, width: Math.max(0, inner.w - depth), height: inner.h, shape: 'rectangle' };
    case 'E': return { x: inner.x, y: inner.y, width: Math.max(0, inner.w - depth), height: inner.h, shape: 'rectangle' };
  }
}

function runFront(strategy: 'rows' | 'square-foot' | 'hex', rect: ParentBounds, cultivars?: Cultivar[]): Slot[] {
  switch (strategy) {
    case 'rows': {
      const out: Slot[] = [];
      const pitch = 0.5;
      for (let y = rect.y + pitch / 2; y <= rect.y + rect.height; y += pitch) {
        for (let x = rect.x + pitch / 2; x <= rect.x + rect.width; x += pitch) {
          out.push({ x, y });
        }
      }
      return out;
    }
    case 'square-foot':
      return computeSquareFoot({ type: 'square-foot', cellSizeFt: 1, marginFt: 0 }, rect, cultivars);
    case 'hex':
      return computeHex({ type: 'hex', pitchFt: 'auto', marginFt: 0 }, rect, cultivars);
  }
}
