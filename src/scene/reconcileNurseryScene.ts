import type { NurseryState } from '../model/nursery';
import type { NurseryScene } from './nurseryScene';
import { nurseryToScene } from './nurseryScene';
import { deepEqual } from './reconcileScene';

/**
 * Mutate `scene` in place so its nodes match `target` (the nursery analog of
 * reconcileScene). Reuses nurseryToScene for all pose/order/parent logic, then
 * diffs against the live scene and emits minimal kit ops in one batch (one undo
 * entry, one coalesced notify). The scene instance is never recreated, so a
 * mounted <SceneCanvas> keeps its ref.
 */
export function reconcileNurseryScene(scene: NurseryScene, target: NurseryState): void {
  const specs = nurseryToScene(target);
  const targetIds = new Set(specs.map((s) => String(s.id)));

  scene.batch('reconcile-nursery', () => {
    // 1. Rebuild roots: present in both but kind/layer differs (no setKind).
    //    The re-add happens in the Adds pass below (node is now absent). A
    //    rebuild root's descendants are never *retained in place* — but a
    //    container demoting to leaf can have a descendant that relocates to a
    //    different parent in the target; that descendant is dropped by the
    //    subtree remove here and then RE-ADDED by the Adds pass (since it's a
    //    spec absent from survivors). Correctness therefore depends on the Adds
    //    pass re-adding every spec'd node absent after removals — do not add a
    //    "skip already-existing" guard to the Adds pass without accounting for
    //    this.
    for (const s of specs) {
      const node = scene.get(s.id!);
      if (node && (node.kind !== s.kind || node.layer !== s.layer)) scene.remove(s.id!);
    }
    // 2. Removals: target-absent boundary roots (subtree-safe, snapshot iterate).
    for (const [idRaw, node] of [...scene.nodes]) {
      const id = String(idRaw);
      if (targetIds.has(id)) continue;
      const parent = node.parent ? String(node.parent) : null;
      if ((parent === null || targetIds.has(parent)) && scene.get(idRaw)) scene.remove(idRaw);
    }
    // 3. Adds: specs absent after removals, in spec order (parent-first).
    const survivors = new Set([...scene.nodes.keys()].map(String));
    for (const s of specs) {
      if (!survivors.has(String(s.id))) scene.add(s);
    }
    // 4. Updates: surviving nodes only.
    for (const s of specs) {
      if (!survivors.has(String(s.id))) continue;
      const node = scene.get(s.id!)!;
      const curParent = node.parent ? String(node.parent) : null;
      const tgtParent = s.parent ? String(s.parent) : null;
      if (curParent !== tgtParent) scene.move(s.id!, s.parent ?? null);
      if (!deepEqual(node.pose, s.pose)) scene.setPose(s.id!, s.pose);
      if (!deepEqual(node.data, s.data)) scene.update(s.id!, { data: s.data });
    }
  });
}
