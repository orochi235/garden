/**
 * Vendored clone-gesture surface (kept for `useEricCycleTool`'s alt-drag clone).
 *
 * Phase 7 step 3 deleted eric's parallel move/resize/area-select gesture
 * controllers in favor of the kit gesture dispatcher. The clone controller has
 * no kit hook analog (the kit exposes `cloneAction` for the dispatcher, but the
 * cycle tool drives its alt-click-then-drag clone imperatively), so it survives
 * here alongside its `cloneByAltDrag` behavior and the supporting types.
 */

export { cloneByAltDrag } from './behaviors';
export {
  type UseCloneOptions,
  type UseCloneReturn,
  useClone,
} from './clone';
export type { CloneBehavior, CloneLayer, ClonePose, ModifierState } from './types';
