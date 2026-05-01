import { describe, it, expect } from 'vitest';
import type { OrderedAdapter } from './types';

describe('OrderedAdapter', () => {
  it('accepts an empty implementation (both methods optional)', () => {
    const a: OrderedAdapter = {};
    expect(a).toBeDefined();
  });

  it('accepts an implementation with both methods', () => {
    const a: OrderedAdapter = {
      getChildren: (p) => (p === null ? ['a', 'b'] : []),
      setChildOrder: () => {},
    };
    expect(a.getChildren?.(null)).toEqual(['a', 'b']);
  });
});
