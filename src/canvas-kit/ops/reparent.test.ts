import { describe, expect, it } from 'vitest';
import { createReparentOp } from './reparent';

describe('createReparentOp', () => {
  function makeAdapter() {
    const calls: { id: string; parentId: string | null }[] = [];
    return {
      setParent: (id: string, parentId: string | null) => calls.push({ id, parentId }),
      calls,
    };
  }

  it('apply writes the to-parent', () => {
    const op = createReparentOp({ id: 'a', from: 'old', to: 'new' });
    const adapter = makeAdapter();
    op.apply(adapter as any);
    expect(adapter.calls).toEqual([{ id: 'a', parentId: 'new' }]);
  });

  it('invert swaps from and to', () => {
    const op = createReparentOp({ id: 'a', from: 'old', to: 'new' });
    const adapter = makeAdapter();
    op.invert().apply(adapter as any);
    expect(adapter.calls).toEqual([{ id: 'a', parentId: 'old' }]);
  });

  it('handles null parents', () => {
    const op = createReparentOp({ id: 'a', from: null, to: 'new' });
    expect(op.invert().apply.toString().length).toBeGreaterThan(0);
    const adapter = makeAdapter();
    op.invert().apply(adapter as any);
    expect(adapter.calls).toEqual([{ id: 'a', parentId: null }]);
  });
});
