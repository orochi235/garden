import type { GroupAdapter } from './types';

interface OrderedSceneShape {
  getChildren(parentId: string | null): string[];
  setChildOrder(parentId: string | null, ids: string[]): void;
}

/**
 * Compose a scene adapter's getChildren/setChildOrder with a group adapter
 * so that `parentId === <groupId>` routes to the group's `members[]`. Other
 * parent ids fall through to the scene adapter unchanged.
 *
 * Returns a new object with the routed methods. Use it directly as the
 * `OrderedAdapter` mixin on your full scene adapter:
 *
 *     const ordered = withGroupOrdering(myScene, myGroupAdapter);
 *     myScene.getChildren = ordered.getChildren;
 *     myScene.setChildOrder = ordered.setChildOrder;
 */
export function withGroupOrdering<T extends OrderedSceneShape>(
  scene: T,
  groups: Pick<GroupAdapter, 'getGroup'>,
): OrderedSceneShape {
  return {
    getChildren(parentId) {
      if (parentId !== null) {
        const g = groups.getGroup(parentId);
        if (g) return g.members.slice();
      }
      return scene.getChildren(parentId);
    },
    setChildOrder(parentId, ids) {
      if (parentId !== null) {
        const g = groups.getGroup(parentId);
        if (g) {
          g.members = ids.slice();
          return;
        }
      }
      scene.setChildOrder(parentId, ids);
    },
  };
}
