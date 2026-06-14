import { asNodeId } from '@orochi235/weasel';
import type { Garden } from '../model/types';
import { gardenToScene } from './gardenConverters';
import type { GardenScene } from './gardenScene';

/**
 * Structural deep-equality that treats `undefined` and absent keys as equal.
 * Used to decide whether a pose/data field actually changed before emitting an
 * op, so an unchanged target produces zero ops.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) {
    const av = ao[k];
    const bv = bo[k];
    if (av === undefined && bv === undefined) continue;
    if (!deepEqual(av, bv)) return false;
  }
  return true;
}

/**
 * Mutate `scene` in place so its nodes match `target` — the Phase-3 replacement
 * for the wholesale "rebuild the instance" bridge. Reuses gardenToScene for all
 * frame/footprint/container/layer logic, then diffs the resulting specs against
 * the live scene and emits the minimal kit ops in a single batch (one undo
 * entry, one coalesced notify).
 */
export function reconcileScene(scene: GardenScene, target: Garden): void {
  const specs = gardenToScene(target);
  const targetIds = new Set(specs.map((s) => String(s.id)));

  scene.batch('reconcile', () => {
    // 1. Rebuild roots: nodes present in both whose kind or layer differs. kit
    //    has no setKind, and cross-layer move/setLayer can't satisfy the
    //    subtree-layer assertion, so remove-subtree + re-add (the re-add happens
    //    in the Adds pass below, since the node is now absent). In eric's data a
    //    rebuild root never has surviving descendants (leaf↔container = no
    //    children; cross-layer = a leaf planting).
    for (const s of specs) {
      const node = scene.get(asNodeId(String(s.id)));
      if (node && (node.kind !== s.kind || node.layer !== s.layer)) {
        scene.remove(asNodeId(String(s.id)));
      }
    }

    // 2. Removals: target-absent boundary roots. remove() takes the whole
    //    subtree; guard with get() since a parent removal may already have
    //    deleted descendants. Iterate a snapshot since we mutate.
    for (const [idRaw, node] of [...scene.nodes]) {
      const id = String(idRaw);
      if (targetIds.has(id)) continue;
      const parent = node.parent ? String(node.parent) : null;
      if ((parent === null || targetIds.has(parent)) && scene.get(idRaw)) {
        scene.remove(idRaw);
      }
    }

    // 3. Adds: specs absent after removals, in spec order (parent-first).
    const survivors = new Set([...scene.nodes.keys()].map(String));
    for (const s of specs) {
      if (!survivors.has(String(s.id))) scene.add(s);
    }

    // 4. Updates: surviving nodes only (newly added are already correct).
    for (const s of specs) {
      const id = String(s.id);
      if (!survivors.has(id)) continue;
      const node = scene.get(asNodeId(id))!;
      const curParent = node.parent ? String(node.parent) : null;
      const tgtParent = s.parent ? String(s.parent) : null;
      if (curParent !== tgtParent) {
        scene.move(asNodeId(id), tgtParent ? asNodeId(tgtParent) : null);
      }
      if (!deepEqual(node.pose, s.pose)) scene.setPose(asNodeId(id), s.pose);
      if (!deepEqual(node.data, s.data)) scene.update(asNodeId(id), { data: s.data });
    }
  });
}
