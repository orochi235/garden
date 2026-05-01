/**
 * Units — a tiny customizable unit system for canvas-kit APIs.
 *
 * The kit stores all coordinates as bare numbers in a single base unit
 * chosen by the consumer app. To make API call sites self-documenting,
 * the public surface accepts `UnitValue` — either a bare number (interpreted
 * as base units) or a `{ value, unit }` tag that's resolved against a
 * `UnitRegistry` at the API boundary. Internals never see units.
 *
 * Linear factors only. No per-axis units. No mixed-unit arithmetic.
 */

/** A unit name (e.g. `'in'`, `'ft'`, `'mm'`). Looked up in a `UnitRegistry`. */
export type Unit = string;

/** Conversion table mapping unit names to factors against a base unit. */
export interface UnitRegistry {
  /** Name of the base unit, e.g. 'in'. All conversions resolve to this. */
  base: Unit;
  /** Factor to multiply a value in `unit` by to get base units. base unit's factor is 1. */
  units: Record<Unit, number>;
}

/** Value at a unit-aware API boundary: bare number (in base units) or `{ value, unit }` tag. */
export type UnitValue = number | { value: number; unit: Unit };

/**
 * Resolve a UnitValue to a number in base units.
 *  - bare number: returned as-is (assumed base)
 *  - tagged: looks up factor; throws if unit not in registry
 */
export function resolveUnit(v: UnitValue, registry?: UnitRegistry): number {
  if (typeof v === 'number') return v;
  if (!registry) {
    throw new Error(
      `resolveUnit: tagged value { value: ${v.value}, unit: '${v.unit}' } requires a UnitRegistry`,
    );
  }
  const factor = registry.units[v.unit];
  if (factor === undefined) {
    const known = Object.keys(registry.units).join(', ') || '(none)';
    throw new Error(
      `resolveUnit: unknown unit '${v.unit}' (registry base: '${registry.base}', known units: ${known})`,
    );
  }
  return v.value * factor;
}

/**
 * Format a base-unit number as a string in the named display unit.
 *  e.g. formatUnit(36, 'ft', IMPERIAL_INCHES) => '3ft'
 *  Default precision: 2. Trailing zeros trimmed.
 */
export function formatUnit(
  baseValue: number,
  displayUnit: Unit,
  registry: UnitRegistry,
  opts?: { precision?: number; suffix?: boolean },
): string {
  const factor = registry.units[displayUnit];
  if (factor === undefined) {
    const known = Object.keys(registry.units).join(', ') || '(none)';
    throw new Error(
      `formatUnit: unknown unit '${displayUnit}' (registry base: '${registry.base}', known units: ${known})`,
    );
  }
  const precision = opts?.precision ?? 2;
  const suffix = opts?.suffix ?? true;
  const display = baseValue / factor;
  // Trim trailing zeros (and a dangling decimal point) without losing precision.
  let s = display.toFixed(precision);
  if (s.includes('.')) {
    s = s.replace(/0+$/, '').replace(/\.$/, '');
  }
  return suffix ? `${s}${displayUnit}` : s;
}

/** Imperial registry with base 'in'. */
export const IMPERIAL_INCHES: UnitRegistry = {
  base: 'in',
  units: { in: 1, ft: 12, yd: 36, mi: 63360 },
};

/** Metric registry with base 'mm'. */
export const METRIC_MM: UnitRegistry = {
  base: 'mm',
  units: { mm: 1, cm: 10, m: 1000, km: 1_000_000 },
};

/** Pixel registry — sole unit is the base. */
export const PIXELS: UnitRegistry = {
  base: 'px',
  units: { px: 1 },
};
