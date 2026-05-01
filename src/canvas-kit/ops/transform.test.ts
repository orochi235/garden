import { describe, expect, it } from 'vitest';
import { createTransformOp } from './transform';

interface FakePose { x: number; y: number; w?: number }

function makeAdapter() {
  const calls: { id: string; pose: FakePose }[] = [];
  return {
    setPose: (id: string, pose: FakePose) => calls.push({ id, pose }),
    calls,
  };
}

describe('createTransformOp', () => {
  it('apply writes the to-pose', () => {
    const op = createTransformOp<FakePose>({ id: 'a', from: { x: 1, y: 2 }, to: { x: 3, y: 4 } });
    const adapter = makeAdapter();
    op.apply(adapter as any);
    expect(adapter.calls).toEqual([{ id: 'a', pose: { x: 3, y: 4 } }]);
  });

  it('invert swaps from and to', () => {
    const op = createTransformOp<FakePose>({ id: 'a', from: { x: 1, y: 2 }, to: { x: 3, y: 4 } });
    const inv = op.invert();
    const adapter = makeAdapter();
    inv.apply(adapter as any);
    expect(adapter.calls).toEqual([{ id: 'a', pose: { x: 1, y: 2 } }]);
  });

  it('apply then apply(invert) returns adapter to baseline', () => {
    const op = createTransformOp<FakePose>({ id: 'a', from: { x: 1, y: 2, w: 5 }, to: { x: 3, y: 4, w: 9 } });
    const adapter = makeAdapter();
    op.apply(adapter as any);
    op.invert().apply(adapter as any);
    expect(adapter.calls[1].pose).toEqual({ x: 1, y: 2, w: 5 });
  });

  it('exposes a label', () => {
    const op = createTransformOp<FakePose>({ id: 'a', from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, label: 'Move' });
    expect(op.label).toBe('Move');
  });
});
