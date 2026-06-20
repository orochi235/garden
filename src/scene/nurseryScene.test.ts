import { describe, expect, it } from 'vitest';
import { createTray, createSeedling, setCell, type NurseryState } from '../model/nursery';
import {
  createNurseryScene,
  nurseryToScene,
  sceneToNursery,
  splitNurseryBase,
} from './nurseryScene';

function sown(ns: NurseryState, trayIdx: number, row: number, col: number, cultivarId: string) {
  const tray = ns.trays[trayIdx];
  const s = createSeedling({ cultivarId, trayId: tray.id, row, col });
  ns.trays[trayIdx] = setCell(tray, row, col, { state: 'sown', seedlingId: s.id });
  ns.seedlings.push(s);
}

function fixture(): NurseryState {
  const ns: NurseryState = {
    trays: [
      createTray({ rows: 2, cols: 2, cellSize: 'medium', label: 'A' }),
      createTray({ rows: 3, cols: 3, cellSize: 'small', label: 'B' }),
    ],
    seedlings: [],
  };
  sown(ns, 0, 0, 0, 'tomato');
  sown(ns, 0, 1, 1, 'basil');
  sown(ns, 1, 2, 0, 'pepper');
  ns.seedlings.push(createSeedling({ cultivarId: 'kale', trayId: null, row: null, col: null }));
  return ns;
}

describe('nurseryToScene + sceneToNursery round-trip', () => {
  it('preserves trays (in order), in-tray seedlings, and transplanted-out via base', () => {
    const ns = fixture();
    const scene = createNurseryScene(nurseryToScene(ns));
    const base = splitNurseryBase(ns);
    const out = sceneToNursery(scene, base);

    expect(out.trays.map((t) => t.label)).toEqual(['A', 'B']);
    expect(out.trays).toEqual(ns.trays);

    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect([...out.seedlings].sort(byId)).toEqual([...ns.seedlings].sort(byId));
    expect(out.seedlings.some((s) => s.cultivarId === 'kale' && s.trayId === null)).toBe(true);
  });

  it('excludes transplanted-out seedlings from the scene nodes', () => {
    const ns = fixture();
    const scene = createNurseryScene(nurseryToScene(ns));
    const seedlingNodes = [...scene.nodes].filter(([, n]) => n.data.kind === 'seedling');
    expect(seedlingNodes).toHaveLength(3);
  });

  it('emits a seedling as a leaf child of its tray with a parent-local cell pose', () => {
    const ns = fixture();
    const specs = nurseryToScene(ns);
    const seedlingSpec = specs.find((s) => s.data.kind === 'seedling')!;
    expect(seedlingSpec.kind).toBe('leaf');
    expect(seedlingSpec.layer).toBe('seedlings');
    expect(String(seedlingSpec.parent)).toBe(ns.trays[0].id);
    expect(seedlingSpec.pose.x).toBeGreaterThan(0);
  });

  it('splitNurseryBase returns only transplanted-out seedlings', () => {
    const ns = fixture();
    expect(splitNurseryBase(ns).transplanted).toHaveLength(1);
  });
});
