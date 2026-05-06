import { describe, it, expect, vi } from 'vitest';

vi.mock('../../optimizer', async () => {
  const real = await vi.importActual<typeof import('../../optimizer')>('../../optimizer');
  return {
    ...real,
    runOptimizer: vi.fn().mockReturnValue({
      promise: Promise.resolve({ candidates: [], totalMs: 1 }),
      cancel: () => {},
    }),
  };
});

import { runOptimizerForBed } from './runOptimizerForBed';

describe('runOptimizerForBed', () => {
  it('converts feet to inches', async () => {
    const bed: any = { width: 4, length: 8 };
    const cultivar: any = { id: 'a', speciesId: 'tomato', footprintFt: 1, heightFt: 5, category: 'vegetables' };
    await runOptimizerForBed({ bed, request: [{ cultivar, count: 2 }] }).promise;
    const { runOptimizer } = await import('../../optimizer');
    const call = (runOptimizer as any).mock.calls[0];
    expect(call[0].bed.widthIn).toBe(48);
    expect(call[0].bed.lengthIn).toBe(96);
    expect(call[0].plants[0].footprintIn).toBe(12);
    expect(call[0].plants[0].category).toBe('vegetables');
  });

  it('prefers cultivar.heightFtOverride over the resolved species heightFt', async () => {
    (await import('../../optimizer')).runOptimizer as any;
    const { runOptimizer } = await import('../../optimizer');
    (runOptimizer as any).mockClear?.();

    const bed: any = { width: 4, length: 8 };
    const cultivar: any = {
      id: 'tomato-determinate',
      speciesId: 'tomato',
      footprintFt: 1,
      spacingFt: 1,
      heightFt: 6, // species default merged in
      heightFtOverride: 3, // cultivar-level override (determinate)
      climber: false,
      category: 'vegetables',
    };
    await runOptimizerForBed({ bed, request: [{ cultivar, count: 1 }] }).promise;
    const call = (runOptimizer as any).mock.calls.at(-1);
    // override 3ft * 12 = 36in
    expect(call[0].plants[0].heightIn).toBe(36);
  });

  it('falls back to cultivar.heightFt when no override is set', async () => {
    const { runOptimizer } = await import('../../optimizer');
    (runOptimizer as any).mockClear?.();

    const bed: any = { width: 4, length: 8 };
    const cultivar: any = {
      id: 'tomato-indeterminate',
      speciesId: 'tomato',
      footprintFt: 1,
      spacingFt: 1,
      heightFt: 6, // species default
      // heightFtOverride absent
      climber: false,
      category: 'vegetables',
    };
    await runOptimizerForBed({ bed, request: [{ cultivar, count: 1 }] }).promise;
    const call = (runOptimizer as any).mock.calls.at(-1);
    expect(call[0].plants[0].heightIn).toBe(72);
  });
});
