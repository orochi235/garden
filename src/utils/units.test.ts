import { describe, expect, it } from 'vitest';
import { displayToFeet, feetToDisplay, unitLabel } from './units';

describe('feetToDisplay', () => {
  it('converts feet to feet (identity)', () => {
    expect(feetToDisplay(3, 'ft')).toBeCloseTo(3);
  });

  it('converts feet to inches', () => {
    expect(feetToDisplay(2, 'in')).toBeCloseTo(24);
  });

  it('converts feet to meters', () => {
    expect(feetToDisplay(1, 'm')).toBeCloseTo(0.3048);
  });

  it('converts feet to centimeters', () => {
    expect(feetToDisplay(1, 'cm')).toBeCloseTo(30.48);
  });
});

describe('displayToFeet', () => {
  it('converts inches to feet', () => {
    expect(displayToFeet(24, 'in')).toBeCloseTo(2);
  });

  it('converts meters to feet', () => {
    expect(displayToFeet(1, 'm')).toBeCloseTo(3.28084, 3);
  });
});

describe('unitLabel', () => {
  it('returns correct labels', () => {
    expect(unitLabel('ft')).toBe('ft');
    expect(unitLabel('in')).toBe('in');
    expect(unitLabel('m')).toBe('m');
    expect(unitLabel('cm')).toBe('cm');
  });
});
