import { useCallback, useRef, useState } from 'react';
import type { InsertAdapter } from '../../adapters/types';
import type { Op } from '../../ops/types';
import type { CloneBehavior, CloneLayer, ModifierState } from '../types';

/** Options for `useCloneInteraction`. */
export interface UseCloneInteractionOptions {
  behaviors: CloneBehavior[];
  setOverlay: (layer: CloneLayer, objects: unknown[]) => void;
  clearOverlay: () => void;
  /** Optional: expand the incoming id list before snapshot. Used for
   *  virtual-group expansion (groups have no pose; their leaves do).
   *  Called once at `start()`. Returning `[]` aborts the gesture cleanly.
   *  Default: identity. */
  expandIds?: (ids: string[]) => string[];
}

/** Return shape of `useCloneInteraction`: lifecycle methods plus the `isCloning` flag. */
export interface UseCloneInteractionReturn {
  start(worldX: number, worldY: number, ids: string[], layer: CloneLayer, mods: ModifierState): void;
  move(worldX: number, worldY: number, mods: ModifierState): boolean;
  end(): void;
  cancel(): void;
  readonly isCloning: boolean;
}

interface SnapshotItem {
  id: string;
  x?: number;
  y?: number;
  /** Garden adapter wraps objects as { kind, data } — data carries the real coords. */
  data?: { id: string; x?: number; y?: number };
  [key: string]: unknown;
}

interface ActiveState {
  ids: string[];
  layer: CloneLayer;
  startWorldX: number;
  startWorldY: number;
  worldX: number;
  worldY: number;
  behavior: CloneBehavior;
  /** Normalized snapshot items carrying { id, x, y } for overlay translation. */
  snapshotItems: { id: string; x: number; y: number }[];
}

function normalizeItem(raw: unknown): { id: string; x: number; y: number } {
  const item = raw as SnapshotItem;
  // Garden adapter shape: { kind, data: { id, x, y, ... } }
  if (item.data) {
    return { id: item.data.id, x: item.data.x ?? 0, y: item.data.y ?? 0 };
  }
  // Flat shape (tests + any adapter that stores ids directly): { id, x?, y? }
  return { id: item.id, x: item.x ?? 0, y: item.y ?? 0 };
}

/** Drag-to-clone interaction; behavior decides which modifiers activate cloning vs plain move. */
export function useCloneInteraction<T extends { id: string }>(
  adapter: InsertAdapter<T>,
  options: UseCloneInteractionOptions,
): UseCloneInteractionReturn {
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const optsRef = useRef(options);
  optsRef.current = options;

  const [isCloning, setIsCloning] = useState(false);
  const stateRef = useRef<ActiveState | null>(null);

  const publishOverlay = (s: ActiveState, dx: number, dy: number) => {
    const objects = s.snapshotItems.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy }));
    optsRef.current.setOverlay(s.layer, objects);
  };

  const start = useCallback(
    (worldX: number, worldY: number, ids: string[], layer: CloneLayer, mods: ModifierState) => {
      const behavior = optsRef.current.behaviors.find((b) => b.activates(mods));
      if (!behavior) return;
      const expand = optsRef.current.expandIds;
      const expandedIds = expand ? expand(ids) : ids;
      if (expandedIds.length === 0) return;
      const snap = adapterRef.current.snapshotSelection(expandedIds);
      const snapshotItems = snap.items.map(normalizeItem);
      const s: ActiveState = {
        ids: expandedIds,
        layer,
        startWorldX: worldX,
        startWorldY: worldY,
        worldX,
        worldY,
        behavior,
        snapshotItems,
      };
      stateRef.current = s;
      setIsCloning(true);
      publishOverlay(s, 0, 0);
    },
    [],
  );

  const move = useCallback((worldX: number, worldY: number, _mods: ModifierState): boolean => {
    const s = stateRef.current;
    if (!s) return false;
    s.worldX = worldX;
    s.worldY = worldY;
    publishOverlay(s, worldX - s.startWorldX, worldY - s.startWorldY);
    return true;
  }, []);

  const end = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const pose = {
      ids: s.ids,
      offset: { dx: s.worldX - s.startWorldX, dy: s.worldY - s.startWorldY },
      worldX: s.worldX,
      worldY: s.worldY,
    };
    const ops: Op[] = s.behavior.onEnd(pose, { adapter: adapterRef.current as InsertAdapter<{ id: string }> });
    if (ops.length > 0) adapterRef.current.applyBatch(ops, 'Clone');
    optsRef.current.clearOverlay();
    stateRef.current = null;
    setIsCloning(false);
  }, []);

  const cancel = useCallback(() => {
    if (!stateRef.current) return;
    optsRef.current.clearOverlay();
    stateRef.current = null;
    setIsCloning(false);
  }, []);

  return { start, move, end, cancel, isCloning } as UseCloneInteractionReturn;
}
