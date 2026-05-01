import { describe, expect, it } from 'vitest';
import { selectFromMarquee } from './selectFromMarquee';
import type {
  AreaSelectAdapter,
  GestureContext,
  AreaSelectPose,
} from '@/canvas-kit';

function makeAdapter(opts: { selection?: string[]; hits?: string[] } = {}): AreaSelectAdapter {
  return {
    hitTestArea: () => opts.hits ?? [],
    getSelection: () => opts.selection ?? [],
    setSelection: () => {},
    applyOps: () => {},
  };
}

function ctx(
  adapter: AreaSelectAdapter,
  pose: { startX: number; startY: number; curX: number; curY: number; shiftHeld: boolean },
): GestureContext<AreaSelectPose> {
  const start: AreaSelectPose = { worldX: pose.startX, worldY: pose.startY, shiftHeld: pose.shiftHeld };
  const current: AreaSelectPose = { worldX: pose.curX, worldY: pose.curY, shiftHeld: pose.shiftHeld };
  return {
    draggedIds: ['gesture'],
    origin: new Map([['gesture', start]]),
    current: new Map([['gesture', current]]),
    snap: null,
    modifiers: { alt: false, shift: pose.shiftHeld, meta: false, ctrl: false },
    pointer: { worldX: pose.curX, worldY: pose.curY, clientX: 0, clientY: 0 },
    adapter: adapter as never,
    scratch: {},
  };
}

describe('selectFromMarquee', () => {
  it('declares defaultTransient: true', () => {
    const b = selectFromMarquee();
    expect(b.defaultTransient).toBe(true);
  });

  it('non-empty rect with no shift: emits SetSelectionOp(to = hitIds)', () => {
    const adapter = makeAdapter({ hits: ['a', 'b'] });
    const c = ctx(adapter, { startX: 0, startY: 0, curX: 4, curY: 4, shiftHeld: false });
    const result = selectFromMarquee().onEnd!(c);
    expect(result).toHaveLength(1);
    const calls: string[][] = [];
    result![0].apply({ setSelection: (ids: string[]) => calls.push(ids) } as never);
    expect(calls).toEqual([['a', 'b']]);
  });

  it('empty rect with no shift: emits SetSelectionOp(to = [])', () => {
    const adapter = makeAdapter({ hits: [], selection: ['existing'] });
    const c = ctx(adapter, { startX: 5, startY: 5, curX: 5, curY: 5, shiftHeld: false });
    const result = selectFromMarquee().onEnd!(c);
    expect(result).toHaveLength(1);
    const calls: string[][] = [];
    result![0].apply({ setSelection: (ids: string[]) => calls.push(ids) } as never);
    expect(calls).toEqual([[]]);
  });

  it('shift + non-empty rect: merges hits with existing selection (no duplicates, preserves existing order)', () => {
    const adapter = makeAdapter({ hits: ['b', 'c'], selection: ['a', 'b'] });
    const c = ctx(adapter, { startX: 0, startY: 0, curX: 4, curY: 4, shiftHeld: true });
    const result = selectFromMarquee().onEnd!(c);
    const calls: string[][] = [];
    result![0].apply({ setSelection: (ids: string[]) => calls.push(ids) } as never);
    expect(calls).toEqual([['a', 'b', 'c']]);
  });

  it('shift + empty rect: leaves selection unchanged', () => {
    const adapter = makeAdapter({ hits: [], selection: ['a', 'b'] });
    const c = ctx(adapter, { startX: 5, startY: 5, curX: 5, curY: 5, shiftHeld: true });
    const result = selectFromMarquee().onEnd!(c);
    expect(result).toHaveLength(1);
    const calls: string[][] = [];
    result![0].apply({ setSelection: (ids: string[]) => calls.push(ids) } as never);
    expect(calls).toEqual([['a', 'b']]);
  });
});
