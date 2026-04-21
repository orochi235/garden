/**
 * Pattern overlay system for zones and surfaces.
 * Each pattern is a lazily-created CanvasPattern drawn onto an offscreen canvas.
 * To add a new pattern, add an entry to the `patternFactories` map.
 */

export type PatternId = 'hatch' | 'crosshatch' | 'dots';

export interface PatternParamMap {
  hatch: { color?: string; size?: number; lineWidth?: number };
  crosshatch: { color?: string; size?: number; lineWidth?: number };
  dots: { color?: string; size?: number; radius?: number };
}

export interface PatternRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  shape: 'rectangle' | 'circle';
}

export interface PatternOptions<P extends PatternId = PatternId> {
  opacity?: number;
  params?: PatternParamMap[P];
}

type ResolvedParams = Record<string, string | number>;
type PatternFactory = (ctx: CanvasRenderingContext2D, params: ResolvedParams) => CanvasPattern | null;

const patternCache = new Map<string, CanvasPattern | null>();

function cacheKey(id: PatternId, params: ResolvedParams): string {
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join(',');
  return `${id}:${sorted}`;
}

const DEFAULTS: { [P in PatternId]: Required<PatternParamMap[P]> } = {
  hatch: { color: 'goldenrod', size: 5, lineWidth: 1 },
  crosshatch: { color: '#E03030', size: 6, lineWidth: 0.8 },
  dots: { color: 'goldenrod', size: 6, radius: 1 },
};

function createHatch(ctx: CanvasRenderingContext2D, params: ResolvedParams): CanvasPattern | null {
  const size = Number(params.size) || 5;
  const color = String(params.color || 'goldenrod');
  const lineWidth = Number(params.lineWidth) || 1;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const oc = off.getContext('2d')!;
  oc.strokeStyle = color;
  oc.lineWidth = lineWidth;
  oc.beginPath();
  oc.moveTo(0, size);
  oc.lineTo(size, 0);
  oc.stroke();
  return ctx.createPattern(off, 'repeat');
}

function createCrosshatch(ctx: CanvasRenderingContext2D, params: ResolvedParams): CanvasPattern | null {
  const size = Number(params.size) || 6;
  const color = String(params.color || 'goldenrod');
  const lineWidth = Number(params.lineWidth) || 0.8;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const oc = off.getContext('2d')!;
  oc.strokeStyle = color;
  oc.lineWidth = lineWidth;
  oc.beginPath();
  oc.moveTo(0, size);
  oc.lineTo(size, 0);
  oc.moveTo(0, 0);
  oc.lineTo(size, size);
  oc.stroke();
  return ctx.createPattern(off, 'repeat');
}

function createDots(ctx: CanvasRenderingContext2D, params: ResolvedParams): CanvasPattern | null {
  const size = Number(params.size) || 6;
  const color = String(params.color || 'goldenrod');
  const radius = Number(params.radius) || 1;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const oc = off.getContext('2d')!;
  oc.fillStyle = color;
  oc.beginPath();
  oc.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
  oc.fill();
  return ctx.createPattern(off, 'repeat');
}

const patternFactories: Record<PatternId, PatternFactory> = {
  hatch: createHatch,
  crosshatch: createCrosshatch,
  dots: createDots,
};

function getPattern<P extends PatternId>(ctx: CanvasRenderingContext2D, id: P, params: PatternParamMap[P] = {}): CanvasPattern | null {
  const resolved: ResolvedParams = { ...DEFAULTS[id], ...params };
  const key = cacheKey(id, resolved);
  if (patternCache.has(key)) return patternCache.get(key)!;
  const pattern = patternFactories[id](ctx, resolved);
  patternCache.set(key, pattern);
  return pattern;
}

/**
 * Render a pattern overlay clipped to the given region.
 * Pass null/undefined for patternId to skip rendering.
 */
export function renderPatternOverlay<P extends PatternId>(
  ctx: CanvasRenderingContext2D,
  patternId: P | null | undefined,
  region: PatternRegion,
  options: PatternOptions<P> = {},
): void {
  if (!patternId) return;
  const { opacity = 0.9, params } = options;
  const pattern = getPattern(ctx, patternId, params ?? {} as PatternParamMap[P]);
  if (!pattern) return;

  const { x, y, w, h, shape } = region;
  const inset = 1;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = pattern;

  if (shape === 'circle') {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2 - inset, h / 2 - inset, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  }

  ctx.restore();
}
