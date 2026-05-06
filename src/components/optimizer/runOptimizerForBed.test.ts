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
  it('converts feet to inches and forwards bed.trellisEdge', async () => {
    const bed: any = { width: 4, length: 8, trellisEdge: 'N' };
    const cultivar: any = { id: 'a', speciesId: 'tomato', footprintFt: 1, heightFt: 5, climber: false, category: 'vegetables' };
    await runOptimizerForBed({ bed, request: [{ cultivar, count: 2 }] }).promise;
    const { runOptimizer } = await import('../../optimizer');
    const call = (runOptimizer as any).mock.calls[0];
    expect(call[0].bed.widthIn).toBe(48);
    expect(call[0].bed.lengthIn).toBe(96);
    expect(call[0].bed.trellis).toEqual({ kind: 'edge', edge: 'N' });
    expect(call[0].plants[0].footprintIn).toBe(12);
    expect(call[0].plants[0].category).toBe('vegetables');
  });
});
