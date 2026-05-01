import type { Op } from '../ops/types';
import type { ClipboardSnapshot } from '../interactions/types';

/**
 * SnapTarget — where a dragged object would re-parent to if released.
 *
 * `slotPose` is the pose (in world coordinates) the object should snap to
 * within the target. `metadata` is an opaque pass-through for app-specific
 * snap details (slot index, visual hint, etc.).
 */
export interface SnapTarget<TPose = unknown> {
  parentId: string;
  slotPose: TPose;
  metadata?: unknown;
}

/**
 * Full scene adapter. Most consumers implement narrow per-hook subsets
 * (MoveAdapter, ResizeAdapter, ClipboardAdapter, ...) — TypeScript's
 * structural typing means a wider adapter satisfies any narrower interface.
 */
export interface SceneAdapter<TObject extends { id: string }, TPose> {
  // Pull (gesture-time queries)
  getObjects(): TObject[];
  getObject(id: string): TObject | undefined;
  getSelection(): string[];
  hitTest(worldX: number, worldY: number): string | null;
  getPose(id: string): TPose;
  getParent(id: string): string | null;

  // Mutators (called by op apply methods)
  setPose(id: string, pose: TPose): void;
  setParent(id: string, parentId: string | null): void;
  insertObject(object: TObject): void;
  removeObject(id: string): void;
  setSelection(ids: string[]): void;

  // Op submission (gesture commit point)
  applyBatch(ops: Op[], label: string): void;
}

/**
 * Narrow adapter for `useMoveInteraction`. Includes optional snap-target
 * lookup; apps without container-snapping leave it out.
 */
export interface MoveAdapter<TObject extends { id: string }, TPose> {
  getObject(id: string): TObject | undefined;
  getPose(id: string): TPose;
  getParent(id: string): string | null;
  setPose(id: string, pose: TPose): void;
  setParent(id: string, parentId: string | null): void;
  applyBatch(ops: Op[], label: string): void;
  findSnapTarget?(
    draggedId: string,
    worldX: number,
    worldY: number,
  ): SnapTarget<TPose> | null;
}

/**
 * Narrow adapter for `useResizeInteraction`. Mirrors `MoveAdapter`'s shape
 * minus reparenting and snap-target lookup.
 * TPose is constrained to { x, y, width, height } inline to avoid a circular
 * import with interactions/types.ts.
 */
export interface ResizeAdapter<
  TObject extends { id: string },
  TPose extends { x: number; y: number; width: number; height: number },
> {
  getObject(id: string): TObject | undefined;
  getPose(id: string): TPose;
  setPose(id: string, pose: TPose): void;
  applyBatch(ops: Op[], label: string): void;
}

/**
 * Narrow adapter for `useAreaSelectInteraction`. Transient: no checkpoint, no
 * history. The hook calls `applyOps(ops)` instead of `applyBatch(ops, label)`.
 */
export interface AreaSelectAdapter {
  /** Returns ids of objects intersecting the world-space rect. */
  hitTestArea(rect: { x: number; y: number; width: number; height: number }): string[];
  /** Current selection — read by behaviors to compute additive merges. */
  getSelection(): string[];
  /** Mutator wired by `setSelection` op. */
  setSelection(ids: string[]): void;
  /** Apply ops without checkpointing or pushing a history entry. */
  applyOps(ops: Op[]): void;
}

/**
 * Narrow adapter for `useInsertInteraction` and `useClipboard`. The kit knows
 * nothing about what tool is active or what shape to construct; it asks the
 * adapter to produce object(s) given gesture or paste inputs.
 *
 * Drag-rectangle path: `commitInsert(bounds)` returns one new object or null.
 * Clipboard paste path: `commitPaste(clipboard, offset)` returns the array of
 *   newly-materialized objects (in order). Both empty array and array of
 *   length N are valid; the kit wraps each entry in an `InsertOp`.
 *
 * `snapshotSelection(ids)` builds the payload that paste later consumes.
 * `getPasteOffset` is optional; the kit defaults to a fixed grid-cell offset
 * supplied by the consumer (passed to `useClipboard` options if needed; see
 * the hook for resolution order).
 */
export interface InsertAdapter<TObject extends { id: string }> {
  commitInsert(bounds: { x: number; y: number; width: number; height: number }): TObject | null;
  commitPaste(
    clipboard: ClipboardSnapshot,
    offset: { dx: number; dy: number },
    ctx?: { dropPoint?: { worldX: number; worldY: number } },
  ): TObject[];
  snapshotSelection(ids: string[]): ClipboardSnapshot;
  getPasteOffset?(clipboard: ClipboardSnapshot): { dx: number; dy: number };
  /** Mutator wired by `insertObject`-using ops (kit-side InsertOp). */
  insertObject(object: TObject): void;
  /** Mutator wired by `setSelection` ops batched alongside paste. */
  setSelection(ids: string[]): void;
  applyBatch(ops: Op[], label: string): void;
}
