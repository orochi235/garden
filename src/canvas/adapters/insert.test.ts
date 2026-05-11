import { describe, expect, it, beforeEach } from 'vitest';
import { useGardenStore, blankGarden } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createInsertAdapter } from './insert';
import { createInsertOp } from '@orochi235/weasel';
import { createPlanting, createStructure } from '../../model/types';

describe('createInsertAdapter', () => {
  beforeEach(() => {
    useUiStore.setState({ plottingTool: null } as never);
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, structures: [], zones: [] },
    }));
  });

  it('commitInsert returns null when no plottingTool active', () => {
    const a = createInsertAdapter();
    expect(a.commitInsert({ x: 0, y: 0, width: 1, height: 1 })).toBeNull();
  });

  it('commitInsert builds a Structure when category=structures', () => {
    useUiStore.setState({
      plottingTool: { category: 'structures', type: 'bed', color: '#abc' } as never,
    } as never);
    const a = createInsertAdapter();
    const obj = a.commitInsert({ x: 1, y: 2, width: 3, height: 4 });
    expect(obj).toMatchObject({ x: 1, y: 2, width: 3, length: 4 });
    expect((obj as { type: string }).type).toBe('bed');
    expect(typeof obj!.id).toBe('string');
  });

  it('commitInsert builds a Zone when category=zones', () => {
    useUiStore.setState({
      plottingTool: { category: 'zones', color: '#abc', pattern: null } as never,
    } as never);
    const a = createInsertAdapter();
    const obj = a.commitInsert({ x: 1, y: 2, width: 3, height: 4 });
    expect(obj).toMatchObject({ x: 1, y: 2, width: 3, length: 4 });
  });

  it('applyBatch checkpoints + applies InsertOp; undo restores', () => {
    useUiStore.setState({
      plottingTool: { category: 'zones', color: '#abc', pattern: null } as never,
    } as never);
    const a = createInsertAdapter();
    const obj = a.commitInsert({ x: 0, y: 0, width: 2, height: 2 })!;
    a.applyBatch!([createInsertOp({ node: obj })], 'Insert');
    expect(useGardenStore.getState().garden.zones).toHaveLength(1);
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.zones).toHaveLength(0);
  });
});

describe('createInsertAdapter — snapshotSelection + commitPaste', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('snapshotSelection captures structures, zones, plantings matching ids', () => {
    useGardenStore.getState().addStructure({ type: 'pot', x: 0, y: 0, width: 1, length: 1 });
    useGardenStore.getState().loadGarden(useGardenStore.getState().garden);
    useGardenStore.getState().addZone({ x: 2, y: 2, width: 4, length: 4 });
    useGardenStore.getState().loadGarden(useGardenStore.getState().garden);
    const sId = useGardenStore.getState().garden.structures[0].id;
    const zId = useGardenStore.getState().garden.zones[0].id;
    const a = createInsertAdapter();
    const snap = a.snapshotSelection([sId, zId]);
    expect(snap.items).toHaveLength(2);
  });

  it('snapshotSelection ignores ids not in garden', () => {
    const a = createInsertAdapter();
    const snap = a.snapshotSelection(['nope']);
    expect(snap.items).toEqual([]);
  });

  it('commitPaste materializes a structure with a new id and offset coords', () => {
    useGardenStore.getState().addStructure({ type: 'pot', x: 5, y: 6, width: 1, length: 1 });
    useGardenStore.getState().loadGarden(useGardenStore.getState().garden);
    const sId = useGardenStore.getState().garden.structures[0].id;
    const a = createInsertAdapter();
    const snap = a.snapshotSelection([sId]);
    const out = a.commitPaste(snap, { dx: 1, dy: 2 });
    expect(out).toHaveLength(1);
    const made = out[0] as { id: string; x: number; y: number };
    expect(made.id).not.toBe(sId);
    expect(made.x).toBe(6);
    expect(made.y).toBe(8);
  });

  it('commitPaste materializes a zone with a new id and offset coords', () => {
    useGardenStore.getState().addZone({ x: 5, y: 6, width: 4, length: 4 });
    useGardenStore.getState().loadGarden(useGardenStore.getState().garden);
    const zId = useGardenStore.getState().garden.zones[0].id;
    const a = createInsertAdapter();
    const snap = a.snapshotSelection([zId]);
    const out = a.commitPaste(snap, { dx: 2, dy: 3 });
    expect(out).toHaveLength(1);
    const made = out[0] as { id: string; x: number; y: number };
    expect(made.id).not.toBe(zId);
    expect(made.x).toBe(7);
    expect(made.y).toBe(9);
  });

  it('commitPaste materializes plantings (behavior change: legacy useClipboard dropped them)', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    useGardenStore.getState().loadGarden(useGardenStore.getState().garden);
    const sId = useGardenStore.getState().garden.structures[0].id;
    // Insert a planting via direct setState (no addPlanting helper assumed).
    const planting = createPlanting({ parentId: sId, x: 1, y: 1, cultivarId: 'tomato' });
    useGardenStore.setState((s) => ({
      garden: { ...s.garden, plantings: [...s.garden.plantings, planting] },
    }));
    const a = createInsertAdapter();
    // Snapshot the planting only (parent stays in garden; clone keeps same parentId).
    const snap = a.snapshotSelection([planting.id]);
    const out = a.commitPaste(snap, { dx: 0.5, dy: 0.5 });
    expect(out).toHaveLength(1);
    const made = out[0] as { id: string; parentId: string; x: number; y: number };
    expect(made.id).not.toBe(planting.id);
    expect(made.parentId).toBe(sId);
    // Plantings are parent-relative; the offset still applies to local coords
    // so the paste is visible — otherwise it overlaps the original exactly.
    expect(made.x).toBe(1.5);
    expect(made.y).toBe(1.5);
  });

  it('getPasteOffset defaults to one grid cell down-right', () => {
    const a = createInsertAdapter();
    const cell = useGardenStore.getState().garden.gridCellSizeFt;
    const off = a.getPasteOffset!({ items: [] });
    expect(off).toEqual({ dx: cell, dy: cell });
  });
});

describe('createInsertAdapter — commitPaste with dropPoint', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('with dropPoint over a container, planting reparents and uses local coords', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 5, y: 6, width: 4, length: 4 });
    useGardenStore.getState().loadGarden(useGardenStore.getState().garden);
    const sId = useGardenStore.getState().garden.structures[0].id;
    // Source planting under a different (nonexistent) parent — proves reparenting
    const planting = createPlanting({ parentId: 'orig', x: 0, y: 0, cultivarId: 'tomato' });
    const a = createInsertAdapter();
    const snap = { items: [{ kind: 'planting', data: planting }] };
    const out = a.commitPaste(snap, { dx: 0, dy: 0 }, {
      dropPoint: { worldX: 7, worldY: 8 },
    }) as Array<{ parentId: string; x: number; y: number }>;
    expect(out).toHaveLength(1);
    expect(out[0].parentId).toBe(sId);
    expect(out[0].x).toBe(2); // 7 - 5
    expect(out[0].y).toBe(2); // 8 - 6
  });

  it('with dropPoint outside any container, planting is silently dropped', () => {
    const planting = createPlanting({ parentId: 'orig', x: 0, y: 0, cultivarId: 'tomato' });
    const a = createInsertAdapter();
    const snap = { items: [{ kind: 'planting', data: planting }] };
    const out = a.commitPaste(snap, { dx: 0, dy: 0 }, {
      dropPoint: { worldX: 999, worldY: 999 },
    });
    expect(out).toHaveLength(0);
  });

  it('without dropPoint, planting keeps original parent (paste behavior preserved)', () => {
    const planting = createPlanting({ parentId: 'orig', x: 1, y: 1, cultivarId: 'tomato' });
    const a = createInsertAdapter();
    const snap = { items: [{ kind: 'planting', data: planting }] };
    const out = a.commitPaste(snap, { dx: 0.5, dy: 0.5 }) as Array<{ parentId: string; x: number; y: number }>;
    expect(out).toHaveLength(1);
    expect(out[0].parentId).toBe('orig');
    expect(out[0].x).toBe(1.5);
    expect(out[0].y).toBe(1.5);
  });

  it('with dropPoint, structure offset path unaffected', () => {
    const structure = createStructure({ type: 'pot', x: 5, y: 6, width: 1, length: 1 });
    const a = createInsertAdapter();
    const snap = { items: [{ kind: 'structure', data: structure }] };
    const out = a.commitPaste(snap, { dx: 1, dy: 2 }, {
      dropPoint: { worldX: 999, worldY: 999 },
    }) as Array<{ x: number; y: number }>;
    expect(out[0].x).toBe(6);
    expect(out[0].y).toBe(8);
  });
});
