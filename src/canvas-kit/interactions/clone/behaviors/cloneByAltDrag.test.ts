import { describe, expect, it, vi } from 'vitest';
import { cloneByAltDrag } from './cloneByAltDrag';
import type { InsertAdapter, Op } from '../../../index';

interface Obj { id: string }

function makeAdapter(seedSelection: string[] = []): InsertAdapter<Obj> & {
  selection: string[];
  applied: Op[];
  pasteCalls: Array<{ dropPoint?: { worldX: number; worldY: number } }>;
} {
  const a = {
    selection: [...seedSelection],
    applied: [] as Op[],
    pasteCalls: [] as Array<{ dropPoint?: { worldX: number; worldY: number } }>,
    commitInsert: () => null,
    commitPaste: vi.fn((_snap, _off, ctx) => {
      a.pasteCalls.push({ dropPoint: ctx?.dropPoint });
      return [{ id: 'new1' }] as Obj[];
    }),
    snapshotSelection: (ids: string[]) => ({ items: ids.map((id) => ({ id })) }),
    insertObject: (_o: Obj) => {},
    setSelection: (ids: string[]) => { a.selection = [...ids]; },
    applyBatch: (ops: Op[], _label: string) => { a.applied.push(...ops); },
    getSelection: () => a.selection,
  };
  return a as never;
}

describe('cloneByAltDrag', () => {
  it('activates only when alt is held', () => {
    const b = cloneByAltDrag();
    expect(b.activates({ alt: true, shift: false, meta: false, ctrl: false })).toBe(true);
    expect(b.activates({ alt: false, shift: true, meta: true, ctrl: true })).toBe(false);
  });

  it('is non-transient (clone produces a history entry)', () => {
    const b = cloneByAltDrag();
    expect(b.defaultTransient).toBeFalsy();
  });

  it('onEnd returns InsertOps + SetSelectionOp from commitPaste output', () => {
    const adapter = makeAdapter(['orig']);
    const b = cloneByAltDrag();
    const pose = { ids: ['orig'], offset: { dx: 1, dy: 2 }, worldX: 7, worldY: 8 };
    const ops = b.onEnd(pose, { adapter });
    expect(ops).toHaveLength(2); // 1 InsertOp + 1 SetSelectionOp
    expect(adapter.pasteCalls).toHaveLength(1);
    expect(adapter.pasteCalls[0].dropPoint).toEqual({ worldX: 7, worldY: 8 });
  });

  it('returns [] when commitPaste produces nothing', () => {
    const adapter = makeAdapter(['orig']);
    adapter.commitPaste = vi.fn(() => []) as never;
    const b = cloneByAltDrag();
    const ops = b.onEnd(
      { ids: ['orig'], offset: { dx: 0, dy: 0 }, worldX: 0, worldY: 0 },
      { adapter },
    );
    expect(ops).toEqual([]);
  });
});
