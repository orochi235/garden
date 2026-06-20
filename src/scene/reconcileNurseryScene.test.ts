import { describe, expect, it } from 'vitest';
import { createTray, createSeedling, setCell, type NurseryState } from '../model/nursery';
import { createNurseryScene, nurseryToScene } from './nurseryScene';
import { reconcileNurseryScene } from './reconcileNurseryScene';

function withTray(label: string): NurseryState {
  return { trays: [createTray({ rows: 2, cols: 2, cellSize: 'medium', label })], seedlings: [] };
}

describe('reconcileNurseryScene', () => {
  it('adds a newly-sown seedling as a child node', () => {
    const ns = withTray('A');
    const scene = createNurseryScene(nurseryToScene(ns));
    expect([...scene.nodes].filter(([, n]) => n.data.kind === 'seedling')).toHaveLength(0);

    const s = createSeedling({ cultivarId: 'tomato', trayId: ns.trays[0].id, row: 0, col: 0 });
    const next: NurseryState = {
      trays: [setCell(ns.trays[0], 0, 0, { state: 'sown', seedlingId: s.id })],
      seedlings: [s],
    };
    reconcileNurseryScene(scene, next);

    const node = scene.get(s.id as never);
    expect(node).toBeDefined();
    expect(String(node!.parent)).toBe(ns.trays[0].id);
  });

  it('removes a seedling node when the cell is cleared', () => {
    const s = createSeedling({ cultivarId: 'tomato', trayId: undefined, row: 0, col: 0 });
    const tray = createTray({ rows: 2, cols: 2, cellSize: 'medium', label: 'A' });
    const seeded: NurseryState = {
      trays: [setCell({ ...tray }, 0, 0, { state: 'sown', seedlingId: s.id })],
      seedlings: [{ ...s, trayId: tray.id }],
    };
    const scene = createNurseryScene(nurseryToScene(seeded));
    expect(scene.get(s.id as never)).toBeDefined();

    const cleared: NurseryState = { trays: [tray], seedlings: [] };
    reconcileNurseryScene(scene, cleared);
    expect(scene.get(s.id as never)).toBeUndefined();
  });

  it('updates tray order in node data on reorder (no add/remove)', () => {
    const a = createTray({ rows: 1, cols: 1, cellSize: 'medium', label: 'A' });
    const b = createTray({ rows: 1, cols: 1, cellSize: 'medium', label: 'B' });
    const ns: NurseryState = { trays: [a, b], seedlings: [] };
    const scene = createNurseryScene(nurseryToScene(ns));

    reconcileNurseryScene(scene, { trays: [b, a], seedlings: [] });
    const nodeA = scene.get(a.id as never)!;
    const nodeB = scene.get(b.id as never)!;
    expect((nodeA.data as { order: number }).order).toBe(1);
    expect((nodeB.data as { order: number }).order).toBe(0);
  });

  it('a no-op reconcile emits no version bump', () => {
    const ns = withTray('A');
    const scene = createNurseryScene(nurseryToScene(ns));
    const v = scene.getVersion();
    reconcileNurseryScene(scene, ns);
    expect(scene.getVersion()).toBe(v);
  });
});
