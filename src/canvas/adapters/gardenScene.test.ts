import { beforeEach, describe, expect, it } from 'vitest';
import { createGardenSceneAdapter } from './gardenScene';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import type { Op } from '@orochi235/weasel';

describe('gardenSceneAdapter', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  function setup() {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 5, y: 5, width: 4, length: 4 });
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 20, y: 20, width: 4, length: 4 });
    useGardenStore.getState().addZone({ x: 30, y: 30, width: 6, length: 6 });
    const [bed, bed2] = useGardenStore.getState().garden.structures;
    const [zone] = useGardenStore.getState().garden.zones;
    useGardenStore.getState().addPlanting({ parentId: bed.id, x: 1, y: 2, cultivarId: 'tomato' });
    const [planting] = useGardenStore.getState().garden.plantings;
    return { bed, bed2, zone, planting };
  }

  it('getObjects returns all kinds with correct discriminators', () => {
    const { bed, bed2, zone, planting } = setup();
    const a = createGardenSceneAdapter();
    const objs = a.getObjects();
    expect(objs).toHaveLength(4);
    const byKind = (k: string) => objs.filter((o) => o.kind === k).map((o) => o.id);
    expect(byKind('structure').sort()).toEqual([bed.id, bed2.id].sort());
    expect(byKind('zone')).toEqual([zone.id]);
    expect(byKind('planting')).toEqual([planting.id]);
  });

  it('getPose returns world coords for planting and raw x/y for structure', () => {
    const { bed, planting } = setup();
    const a = createGardenSceneAdapter();
    expect(a.getPose(planting.id)).toEqual({ x: bed.x + planting.x, y: bed.y + planting.y });
    expect(a.getPose(bed.id)).toEqual({ x: bed.x, y: bed.y });
  });

  it('setPose on planting stores local coords (round-trip world pose)', () => {
    const { bed, planting } = setup();
    const a = createGardenSceneAdapter();
    const target = { x: bed.x + 2.5, y: bed.y + 3.5 };
    a.setPose(planting.id, target);
    expect(a.getPose(planting.id)).toEqual(target);
    const stored = useGardenStore.getState().garden.plantings.find((p) => p.id === planting.id)!;
    expect(stored.x).toBe(2.5);
    expect(stored.y).toBe(3.5);
  });

  it('setParent on planting recomputes local coords from current world pose', () => {
    // The adapter's responsibility is to send (parentId, recomputedLocal)
    // to the store. The store may then run arrangement on top — out of scope
    // for the adapter contract. Stub updatePlanting to capture what the
    // adapter actually requested.
    const { bed2, planting } = setup();
    const a = createGardenSceneAdapter();
    const worldBefore = a.getPose(planting.id);

    let captured: Partial<{ parentId: string; x: number; y: number }> | null = null;
    let capturedOpts: { skipRearrange?: boolean } | undefined;
    const orig = useGardenStore.getState().updatePlanting;
    useGardenStore.setState({
      updatePlanting: (id, updates, opts) => {
        captured = { ...captured, ...updates };
        capturedOpts = opts;
        orig(id, updates, opts);
      },
    });
    a.setParent(planting.id, bed2.id);
    expect(captured).not.toBeNull();
    expect(captured!.parentId).toBe(bed2.id);
    // World pose was (bed.x+1, bed.y+2). New parent at (bed2.x, bed2.y).
    // Local should be (worldBefore.x - bed2.x, worldBefore.y - bed2.y).
    expect(captured!.x).toBe(worldBefore.x - bed2.x);
    expect(captured!.y).toBe(worldBefore.y - bed2.y);
    // Kit-driven reparent must pass skipRearrange so the explicit local coords
    // survive and are not overwritten by rearrangePlantings.
    expect(capturedOpts?.skipRearrange).toBe(true);
  });

  it('setParent preserves world position end-to-end (skipRearrange bypasses rearrangePlantings)', () => {
    // Integration: planting is dropped at a specific world point near bed2.
    // Even though bed2 has an arrangement, the world pose should be preserved.
    const { bed, bed2, planting } = setup();
    const a = createGardenSceneAdapter();

    // Give bed2 a rows arrangement so rearrangePlantings would normally fire.
    useGardenStore.getState().commitStructureUpdate(bed2.id, {
      arrangement: { type: 'rows', spacingFt: 1, itemSpacingFt: 1, marginFt: 0.25 },
    });

    const worldBefore = a.getPose(planting.id);
    a.setParent(planting.id, bed2.id);

    // World pose after reparent should equal worldBefore (visual position preserved).
    const worldAfter = a.getPose(planting.id);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 5);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 5);

    void bed;
  });

  it('getChildren returns ids of plantings under a structure', () => {
    const { bed, planting } = setup();
    const a = createGardenSceneAdapter();
    expect(a.getChildren!(bed.id)).toEqual([planting.id]);
  });

  it('applyBatch checkpoints exactly once for any number of ops', () => {
    const { planting } = setup();
    const a = createGardenSceneAdapter();
    // Drain undo stack to a known state.
    useGardenStore.getState().loadGarden(useGardenStore.getState().garden);
    expect(useGardenStore.getState().canUndo()).toBe(false);

    let checkpoints = 0;
    const origCheckpoint = useGardenStore.getState().checkpoint;
    useGardenStore.setState({
      checkpoint: () => {
        checkpoints += 1;
        origCheckpoint();
      },
    });

    const noopOp: Op = {
      apply() {},
      invert() { return noopOp; },
    };
    a.applyBatch!([noopOp, noopOp, noopOp], 'Multi');
    expect(checkpoints).toBe(1);

    // And applies all ops (verify with a real mutating op).
    let applies = 0;
    const countingOp: Op = {
      apply() { applies += 1; },
      invert() { return countingOp; },
    };
    a.applyBatch!([countingOp, countingOp, countingOp, countingOp], 'Multi2');
    expect(applies).toBe(4);
    void planting;
  });

  it('hitTest returns top-most overlapping node, hitAll returns full stack', () => {
    const { bed, zone, planting } = setup();
    const a = createGardenSceneAdapter();
    // Center of the planting (world coord = bed.x + planting.x, bed.y + planting.y)
    const px = bed.x + planting.x;
    const py = bed.y + planting.y;
    expect(a.hitTest(px, py)?.id).toBe(planting.id);
    // Center of the structure (no planting): hits the structure.
    expect(a.hitTest(bed.x + 3.5, bed.y + 3.5)?.id).toBe(bed.id);
    // Center of the zone.
    expect(a.hitTest(zone.x + 3, zone.y + 3)?.id).toBe(zone.id);
    // Empty.
    expect(a.hitTest(100, 100)).toBeNull();
    // hitAll on the planting also includes the structure beneath it.
    const stack = a.hitAll(px, py).map((n) => n.id);
    expect(stack[0]).toBe(planting.id);
    expect(stack).toContain(bed.id);
  });

  it('getBounds returns world AABB for each kind', () => {
    const { bed, zone, planting } = setup();
    const a = createGardenSceneAdapter();
    expect(a.getBounds(bed.id)).toEqual({ x: bed.x, y: bed.y, width: bed.width, length: bed.length });
    expect(a.getBounds(zone.id)).toEqual({ x: zone.x, y: zone.y, width: zone.width, length: zone.length });
    const pb = a.getBounds(planting.id);
    expect(pb).not.toBeNull();
    expect(pb!.width).toBeGreaterThan(0);
    expect(pb!.length).toBeGreaterThan(0);
  });

  it('hitTestArea returns ids whose bounds intersect the rect', () => {
    const { bed, bed2 } = setup();
    const a = createGardenSceneAdapter();
    const ids = a.hitTestArea({ x: 0, y: 0, width: 10, height: 10 });
    expect(ids).toContain(bed.id);
    expect(ids).not.toContain(bed2.id);
  });
});
