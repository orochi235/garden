import { describe, expect, it } from 'vitest';
import { createInsertOp } from './create';
import { createDeleteOp } from './delete';

interface Obj { id: string; value: number }

function makeAdapter() {
  const inserts: Obj[] = [];
  const removes: string[] = [];
  return {
    insertObject: (o: Obj) => inserts.push(o),
    removeObject: (id: string) => removes.push(id),
    inserts,
    removes,
  };
}

describe('createInsertOp / createDeleteOp', () => {
  it('createOp applies as insert', () => {
    const obj: Obj = { id: 'a', value: 1 };
    const adapter = makeAdapter();
    createInsertOp<Obj>({ object: obj }).apply(adapter as any);
    expect(adapter.inserts).toEqual([obj]);
  });

  it('createOp inverts to deleteOp', () => {
    const obj: Obj = { id: 'a', value: 1 };
    const adapter = makeAdapter();
    createInsertOp<Obj>({ object: obj }).invert().apply(adapter as any);
    expect(adapter.removes).toEqual(['a']);
  });

  it('deleteOp applies as remove', () => {
    const obj: Obj = { id: 'a', value: 1 };
    const adapter = makeAdapter();
    createDeleteOp<Obj>({ object: obj }).apply(adapter as any);
    expect(adapter.removes).toEqual(['a']);
  });

  it('deleteOp inverts to createOp', () => {
    const obj: Obj = { id: 'a', value: 1 };
    const adapter = makeAdapter();
    createDeleteOp<Obj>({ object: obj }).invert().apply(adapter as any);
    expect(adapter.inserts).toEqual([obj]);
  });
});
