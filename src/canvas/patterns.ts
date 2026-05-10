/**
 * Garden-side pattern overlay helper.
 *
 * Wraps weasel's `patterns-builtin` factories with garden's palette defaults
 * and exposes `getPattern` (returns a TextureHandle) + `paintFor`
 * (returns a ready-to-use Paint). Cache keyed by id+params so each unique
 * tile is registered exactly once with the renderer.
 */

import { hatch, crosshatch, dots, chunks } from '@orochi235/weasel/patterns-builtin';
import type { Paint } from '@orochi235/weasel';
import type { TextureHandle } from './util/weaselLocal';

export type PatternId = 'hatch' | 'crosshatch' | 'dots' | 'chunks';

export interface PatternParamMap {
  hatch: { color?: string; size?: number; lineWidth?: number };
  crosshatch: { color?: string; size?: number; lineWidth?: number };
  dots: { color?: string; size?: number; radius?: number };
  chunks: { color?: string; bg?: string; size?: number; density?: number; chunkSize?: number; seed?: number };
}

const DEFAULTS = {
  hatch: { color: 'goldenrod', size: 5, lineWidth: 1 },
  crosshatch: { color: '#E03030', size: 6, lineWidth: 0.8 },
  dots: { color: 'goldenrod', size: 6, radius: 1 },
  chunks: { color: '#ffffff', bg: '#2e2218', size: 88, density: 0.1, chunkSize: 1.5, seed: 134 },
} as const;

const cache = new Map<string, TextureHandle | null>();

function keyOf(id: PatternId, p: Record<string, unknown>): string {
  return `${id}:${Object.keys(p).sort().map((k) => `${k}=${String(p[k])}`).join(',')}`;
}

function build(id: PatternId, params: Record<string, unknown>): TextureHandle | null {
  const k = keyOf(id, params);
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  let pat: TextureHandle | null;
  switch (id) {
    case 'hatch': pat = hatch(params as PatternParamMap['hatch'] & { color: string }); break;
    case 'crosshatch': pat = crosshatch(params as PatternParamMap['crosshatch'] & { color: string }); break;
    case 'dots': pat = dots(params as PatternParamMap['dots'] & { color: string }); break;
    case 'chunks': pat = chunks(params as PatternParamMap['chunks'] & { color: string }); break;
  }
  cache.set(k, pat);
  return pat;
}

export function getPattern<P extends PatternId>(
  id: P,
  params: Partial<PatternParamMap[P]> = {},
): TextureHandle | null {
  const merged = { ...DEFAULTS[id], ...params } as Record<string, unknown>;
  return build(id, merged);
}

export function paintFor<P extends PatternId>(
  id: P,
  params: Partial<PatternParamMap[P]> = {},
  opacity?: number,
): Paint {
  const handle = getPattern(id, params);
  return handle
    ? { fill: 'pattern', pattern: handle, opacity }
    : { fill: 'solid', color: 'transparent' };
}
