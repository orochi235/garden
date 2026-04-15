import type { DisplayUnit } from '../model/types';

const FEET_PER: Record<DisplayUnit, number> = {
  ft: 1,
  in: 1 / 12,
  m: 3.28084,
  cm: 0.0328084,
};

export function feetToDisplay(feet: number, unit: DisplayUnit): number {
  return feet / FEET_PER[unit];
}

export function displayToFeet(value: number, unit: DisplayUnit): number {
  return value * FEET_PER[unit];
}

export function unitLabel(unit: DisplayUnit): string {
  return unit;
}

export function formatMeasurement(feet: number, unit: DisplayUnit, decimals = 1): string {
  const value = feetToDisplay(feet, unit);
  return `${value.toFixed(decimals)} ${unitLabel(unit)}`;
}
