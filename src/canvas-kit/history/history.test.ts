import { describe, expect, it } from 'vitest';
import { createHistory } from './history';
import { createTransformOp } from '../ops/transform';

interface Pose { x: number; y: number }

function makeAdapter() {
  const state = new Map<string, Pose>();
  return {
    setPose: (id: string, pose: Pose) => state.set(id, { ...pose }),
    state,
  };
}

describe('createHistory', () => {
  it('applies a single op and pushes onto the undo stack', () => {
    const adapter = makeAdapter();
    const history = createHistory(adapter as any);
    history.apply(createTransformOp<Pose>({ id: 'a', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }));
    expect(adapter.state.get('a')).toEqual({ x: 1, y: 1 });
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('undo reverses the last op', () => {
    const adapter = makeAdapter();
    const history = createHistory(adapter as any);
    history.apply(createTransformOp<Pose>({ id: 'a', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }));
    history.undo();
    expect(adapter.state.get('a')).toEqual({ x: 0, y: 0 });
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
  });

  it('redo re-applies the undone op', () => {
    const adapter = makeAdapter();
    const history = createHistory(adapter as any);
    history.apply(createTransformOp<Pose>({ id: 'a', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }));
    history.undo();
    history.redo();
    expect(adapter.state.get('a')).toEqual({ x: 1, y: 1 });
  });

  it('applyBatch is atomic for undo', () => {
    const adapter = makeAdapter();
    const history = createHistory(adapter as any);
    history.applyBatch(
      [
        createTransformOp<Pose>({ id: 'a', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }),
        createTransformOp<Pose>({ id: 'b', from: { x: 0, y: 0 }, to: { x: 2, y: 2 } }),
      ],
      'Batch',
    );
    expect(adapter.state.get('a')).toEqual({ x: 1, y: 1 });
    expect(adapter.state.get('b')).toEqual({ x: 2, y: 2 });
    history.undo();
    expect(adapter.state.get('a')).toEqual({ x: 0, y: 0 });
    expect(adapter.state.get('b')).toEqual({ x: 0, y: 0 });
  });

  it('apply after undo discards the redo stack', () => {
    const adapter = makeAdapter();
    const history = createHistory(adapter as any);
    history.apply(createTransformOp<Pose>({ id: 'a', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }));
    history.undo();
    history.apply(createTransformOp<Pose>({ id: 'a', from: { x: 0, y: 0 }, to: { x: 5, y: 5 } }));
    expect(history.canRedo()).toBe(false);
  });
});
