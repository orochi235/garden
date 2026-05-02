/**
 * Garden-side pattern overlay helper.
 *
 * Wraps weasel's `patterns-builtin` factories with garden's palette defaults
 * and exposes the old `renderPatternOverlay(ctx, kind, region, opts)` shape.
 * Centralizing here keeps consumer call sites unchanged while the kit stays
 * domain-agnostic (weasel's factories require explicit `color`).
 */

import { hatch, crosshatch, dots, chunks } from '@orochi235/weasel/patterns-builtin';
import { renderFilledRegion, type Paint, type Region } from '@orochi235/weasel';

export type PatternId = 'hatch' | 'crosshatch' | 'dots' | 'chunks';

export interface PatternParamMap {
  hatch: { color?: string; size?: number; lineWidth?: number };
  crosshatch: { color?: string; size?: number; lineWidth?: number };
  dots: { color?: string; size?: number; radius?: number };
  chunks: { color?: string; bg?: string; size?: number; density?: number; chunkSize?: number; seed?: number };
}

export interface PatternOptions<P extends PatternId = PatternId> {
  opacity?: number;
  params?: PatternParamMap[P];
}

const DEFAULTS = {
  hatch: { color: 'goldenrod', size: 5, lineWidth: 1 },
  crosshatch: { color: '#E03030', size: 6, lineWidth: 0.8 },
  dots: { color: 'goldenrod', size: 6, radius: 1 },
  chunks: { color: '#ffffff', bg: '#2e2218', size: 88, density: 0.1, chunkSize: 1.5, seed: 134 },
} as const;

const cache = new Map<string, CanvasPattern | null>();

function keyOf(id: PatternId, p: Record<string, unknown>): string {
  return `${id}:${Object.keys(p).sort().map((k) => `${k}=${String(p[k])}`).join(',')}`;
}

function build(ctx: CanvasRenderingContext2D, id: PatternId, params: Record<string, unknown>): CanvasPattern | null {
  const k = keyOf(id, params);
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  let pat: CanvasPattern | null;
  switch (id) {
    case 'hatch': pat = hatch(ctx, params as PatternParamMap['hatch'] & { color: string }); break;
    case 'crosshatch': pat = crosshatch(ctx, params as PatternParamMap['crosshatch'] & { color: string }); break;
    case 'dots': pat = dots(ctx, params as PatternParamMap['dots'] & { color: string }); break;
    case 'chunks': pat = chunks(ctx, params as PatternParamMap['chunks'] & { color: string }); break;
  }
  cache.set(k, pat);
  return pat;
}

export function renderPatternOverlay<P extends PatternId>(
  ctx: CanvasRenderingContext2D,
  id: P,
  region: Region,
  opts: PatternOptions<P> = {},
): void {
  const merged = { ...DEFAULTS[id], ...(opts.params ?? {}) } as Record<string, unknown>;
  const pattern = build(ctx, id, merged);
  if (!pattern) return;
  const paint: Paint = { kind: 'pattern', pattern, opacity: opts.opacity };
  renderFilledRegion(ctx, paint, region);
}
