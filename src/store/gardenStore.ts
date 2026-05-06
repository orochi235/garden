import { create } from 'zustand';
import { computeSlots } from '../model/arrangement';
import type { Arrangement } from '../model/arrangement';
import { createSeedling, emptySeedStartingState, getCell, setCell } from '../model/seedStarting';
import type { Seedling, Tray } from '../model/seedStarting';
import type { Cultivar } from '../model/cultivars';
import type { Blueprint, Garden, LayerId, Planting, Structure, Zone } from '../model/types';
import { createGarden, createPlanting, createStructure, createZone, DEFAULT_WALL_THICKNESS_FT, generateId, getPlantableBounds } from '../model/types';
import { structuresCollide } from '../utils/collision';
import { loadAutosave, persistCollection } from '../utils/file';
import { worldToLocalForParent } from '../utils/plantingPose';
import { canRedo, canUndo, clearHistory, pushHistory, redo, undo } from './history';
import { useUiStore } from './uiStore';

interface GardenStore {
  garden: Garden;
  updateGarden: (
    updates: Partial<
      Pick<
        Garden,
        'name' | 'widthFt' | 'lengthFt' | 'gridCellSizeFt' | 'displayUnit' | 'groundColor'
      >
    >,
  ) => void;
  loadGarden: (garden: Garden) => void;
  setCollection: (collection: Cultivar[]) => void;
  reset: () => void;
  setBlueprint: (blueprint: Blueprint | null) => void;
  addStructure: (opts: {
    type: string;
    x: number;
    y: number;
    width: number;
    length: number;
  }) => void;
  updateStructure: (id: string, updates: Partial<Omit<Structure, 'id' | 'type'>>) => void;
  commitStructureUpdate: (id: string, updates: Partial<Omit<Structure, 'id' | 'type'>>) => void;
  removeStructure: (id: string) => void;
  addZone: (opts: { x: number; y: number; width: number; length: number; color?: string; pattern?: string | null }) => void;
  updateZone: (id: string, updates: Partial<Omit<Zone, 'id'>>) => void;
  commitZoneUpdate: (id: string, updates: Partial<Omit<Zone, 'id'>>) => void;
  removeZone: (id: string) => void;
  addPlanting: (opts: { parentId: string; x: number; y: number; cultivarId: string }) => void;
  updatePlanting: (id: string, updates: Partial<Omit<Planting, 'id'>>, opts?: { skipRearrange?: boolean }) => void;
  commitPlantingUpdate: (id: string, updates: Partial<Omit<Planting, 'id'>>) => void;
  removePlanting: (id: string) => void;
  addTray: (tray: Tray) => void;
  addTraySilent: (tray: Tray) => void;
  removeTray: (trayId: string) => void;
  renameTray: (trayId: string, label: string) => void;
  reorderTrays: (fromIndex: number, toIndex: number) => void;
  sowCell: (trayId: string, row: number, col: number, cultivarId: string, opts?: { replace?: boolean }) => void;
  clearCell: (trayId: string, row: number, col: number) => void;
  moveSeedling: (
    trayId: string,
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
  ) => void;
  moveSeedlingGroup: (
    trayId: string,
    moves: Array<{ seedlingId: string; toRow: number; toCol: number }>,
  ) => void;
  /**
   * Move seedlings across trays in a single undoable batch. Each move names
   * a `seedlingId`, its source tray, destination tray, and destination
   * (toRow,toCol). Within-tray entries (`fromTrayId === toTrayId`) work too
   * — they're applied alongside cross-tray moves so a mixed batch is a single
   *  undo step.
   *
   * Conflict policy: cross-tray moves require their target cell in the
   * destination tray to be empty (or occupied only by another moving
   * seedling). If any cross-tray target collides with a non-moving seedling,
   * the entire batch is rejected (no partial application). Bumping is
   * intra-tray-only — cross-tray drops do not displace existing seedlings.
   */
  moveSeedlingsAcrossTrays: (
    moves: Array<{
      seedlingId: string;
      fromTrayId: string;
      toTrayId: string;
      toRow: number;
      toCol: number;
    }>,
  ) => void;
  fillTray: (trayId: string, cultivarId: string, opts?: { replace?: boolean }) => void;
  fillRow: (trayId: string, row: number, cultivarId: string, opts?: { replace?: boolean }) => void;
  fillColumn: (trayId: string, col: number, cultivarId: string, opts?: { replace?: boolean }) => void;
  applyOptimizerResult: (structureId: string, candidate: import('../optimizer').OptimizationCandidate) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function defaultGarden(): Garden {
  const garden = createGarden({ name: 'My Garden', widthFt: 20, lengthFt: 20 });
  const pathGroupId = generateId();
  garden.structures = [
    createStructure({ type: 'path', x: 5, y: 0, width: 3, length: 20, groupId: pathGroupId }),
    createStructure({ type: 'path', x: 12, y: 0, width: 3, length: 20, groupId: pathGroupId }),
    createStructure({ type: 'path', x: 0, y: 8.5, width: 20, length: 3, groupId: pathGroupId }),
    createStructure({ type: 'raised-bed', x: 1, y: 1, width: 4, length: 7.5 }),
    createStructure({ type: 'raised-bed', x: 8, y: 1, width: 4, length: 7.5 }),
    createStructure({ type: 'raised-bed', x: 15, y: 1, width: 4, length: 7.5 }),
    createStructure({ type: 'raised-bed', x: 1, y: 11.5, width: 4, length: 7.5 }),
    createStructure({ type: 'raised-bed', x: 8, y: 11.5, width: 4, length: 7.5 }),
    createStructure({ type: 'raised-bed', x: 15, y: 11.5, width: 4, length: 7.5 }),
  ];
  return garden;
}

/** Empty garden for tests. */
export function blankGarden(): Garden {
  return createGarden({ name: 'My Garden', widthFt: 20, lengthFt: 20 });
}

/**
 * Apply backfills for fields that may be missing from older serialized
 * gardens. Mutates and returns the garden. Shared by sync init (from
 * localStorage) and `loadGarden` (from disk / network).
 */
function backfillGarden(garden: Garden): Garden {
  for (const s of garden.structures) {
    if (s.wallThicknessFt == null) {
      s.wallThicknessFt = DEFAULT_WALL_THICKNESS_FT[s.type] ?? 0;
    }
    if (s.groupId === undefined) {
      s.groupId = null;
    }
    if (s.clipChildren === undefined) {
      s.clipChildren = true;
    }
  }
  if (!garden.seedStarting) garden.seedStarting = emptySeedStartingState();
  if (!garden.collection) garden.collection = [];
  return garden;
}

/**
 * Synchronous initial garden: prefer the autosaved garden in localStorage
 * so the very first render shows the user's persisted state. Falls back to
 * the seeded default for first-time visitors. Any failure (no window,
 * corrupt JSON) falls back too. App.tsx separately handles the
 * first-time-visit flow of fetching `default.garden` from the server.
 */
function initialGarden(): Garden {
  if (typeof window === 'undefined') return defaultGarden();
  try {
    const saved = loadAutosave();
    if (saved) return backfillGarden(saved);
  } catch {
    // ignore — fall through to default
  }
  return defaultGarden();
}

function isLocked(layer: LayerId): boolean {
  return useUiStore.getState().layerLocked[layer];
}

/**
 * Filter a list of selected ids down to those that still exist in the given
 * garden. Used after undo/redo so selection never references deleted objects.
 */
function scrubSelection(ids: string[], garden: Garden): string[] {
  if (ids.length === 0) return ids;
  const live = new Set<string>();
  for (const s of garden.structures) live.add(s.id);
  for (const z of garden.zones) live.add(z.id);
  for (const p of garden.plantings) live.add(p.id);
  for (const sd of garden.seedStarting?.seedlings ?? []) live.add(sd.id);
  return ids.filter((id) => live.has(id));
}

export const useGardenStore = create<GardenStore>((set, get) => {
  /** Apply a partial update to the garden object. */
  function patch(updates: Partial<Garden>) {
    set((state) => ({ garden: { ...state.garden, ...updates } }));
  }

  /** Push current state to undo stack, then patch. */
  function commitPatch(updates: Partial<Garden>) {
    pushHistory(get().garden, useUiStore.getState().selectedIds);
    patch(updates);
  }

  /** Fill a selection of cells with seedlings. When replace=true, sown cells are overwritten. */
  function fillCells(
    trayId: string,
    cultivarId: string,
    replace: boolean,
    selector: (row: number, col: number) => boolean,
  ) {
    const { seedStarting } = get().garden;
    const tray = seedStarting.trays.find((t) => t.id === trayId);
    if (!tray) return;
    let updatedTray = tray;
    const newSeedlings: Seedling[] = [];
    const removedIds = new Set<string>();
    for (let r = 0; r < tray.rows; r++) {
      for (let c = 0; c < tray.cols; c++) {
        if (!selector(r, c)) continue;
        const slot = updatedTray.slots[r * tray.cols + c];
        if (slot.state === 'sown') {
          if (!replace) continue;
          if (slot.seedlingId) removedIds.add(slot.seedlingId);
        }
        const seedling = createSeedling({ cultivarId, trayId, row: r, col: c });
        newSeedlings.push(seedling);
        updatedTray = setCell(updatedTray, r, c, { state: 'sown', seedlingId: seedling.id });
      }
    }
    if (newSeedlings.length === 0) return;
    const remainingSeedlings = removedIds.size
      ? seedStarting.seedlings.filter((s) => !removedIds.has(s.id))
      : seedStarting.seedlings;
    commitPatch({
      seedStarting: {
        ...seedStarting,
        trays: seedStarting.trays.map((t) => (t.id === trayId ? updatedTray : t)),
        seedlings: [...remainingSeedlings, ...newSeedlings],
      },
    });
  }

  /** Map over a collection, replacing the item with matching id. */
  function mapCollection<T extends { id: string }>(
    items: T[],
    id: string,
    updates: Partial<Omit<T, 'id'>>,
  ): T[] {
    return items.map((item) => (item.id === id ? { ...item, ...updates } : item));
  }

  /** Rearrange all plantings in a parent by snapping them to computed slots. */
  function rearrangePlantings(
    plantings: Planting[],
    parentId: string,
    parent: { x: number; y: number; width: number; length: number; shape?: string; arrangement: Arrangement | null; wallThicknessFt?: number },
  ): Planting[] {
    const arrangement = parent.arrangement;
    if (!arrangement || arrangement.type === 'free') return plantings;

    const bounds = getPlantableBounds(parent);
    const slots = computeSlots(arrangement, bounds);

    const children = plantings.filter((p) => p.parentId === parentId);
    const others = plantings.filter((p) => p.parentId !== parentId);

    const rearranged = children.map((p, i) => {
      if (i >= slots.length) return p;
      const local = worldToLocalForParent(parent, slots[i].x, slots[i].y);
      return { ...p, x: local.x, y: local.y };
    });
    return [...others, ...rearranged];
  }

  return {
    garden: initialGarden(),

    loadGarden: (garden) => {
      clearHistory();
      set({ garden: backfillGarden(garden) });
    },

    reset: () => {
      clearHistory();
      set({ garden: defaultGarden() });
    },

    updateGarden: (updates) => {
      commitPatch(updates);
    },

    setCollection: (collection) => {
      // Collection edits are catalog-level, not garden-state — keep them out
      // of the undo stack so undo only rewinds garden changes.
      patch({ collection });
      persistCollection(collection);
    },

    setBlueprint: (blueprint) => {
      commitPatch({ blueprint });
    },

    // --- Structures ---

    addStructure: (opts) => {
      if (isLocked('structures')) return;
      const { structures } = get().garden;
      const newStructure = createStructure(opts);
      if (structuresCollide(newStructure, structures)) return;
      commitPatch({ structures: [...structures, newStructure] });
    },

    updateStructure: (id, updates) => {
      if (isLocked('structures')) return;
      patch({ structures: mapCollection(get().garden.structures, id, updates) });
    },

    commitStructureUpdate: (id, updates) => {
      if (isLocked('structures')) return;
      const newStructures = mapCollection(get().garden.structures, id, updates);
      if ('arrangement' in updates) {
        const parent = newStructures.find((s) => s.id === id);
        if (parent) {
          const newPlantings = rearrangePlantings(get().garden.plantings, id, parent);
          commitPatch({ structures: newStructures, plantings: newPlantings });
          return;
        }
      }
      commitPatch({ structures: newStructures });
    },

    removeStructure: (id) => {
      if (isLocked('structures')) return;
      const { structures, plantings } = get().garden;
      commitPatch({
        structures: structures.filter((s) => s.id !== id),
        plantings: plantings.filter((p) => p.parentId !== id),
      });
    },

    // --- Zones ---

    addZone: (opts) => {
      if (isLocked('zones')) return;
      const { zones } = get().garden;
      commitPatch({ zones: [...zones, createZone(opts)] });
    },

    updateZone: (id, updates) => {
      if (isLocked('zones')) return;
      patch({ zones: mapCollection(get().garden.zones, id, updates) });
    },

    commitZoneUpdate: (id, updates) => {
      if (isLocked('zones')) return;
      const newZones = mapCollection(get().garden.zones, id, updates);
      if ('arrangement' in updates) {
        const parent = newZones.find((z) => z.id === id);
        if (parent) {
          const newPlantings = rearrangePlantings(get().garden.plantings, id, parent);
          commitPatch({ zones: newZones, plantings: newPlantings });
          return;
        }
      }
      commitPatch({ zones: newZones });
    },

    removeZone: (id) => {
      if (isLocked('zones')) return;
      const { zones, plantings } = get().garden;
      commitPatch({
        zones: zones.filter((z) => z.id !== id),
        plantings: plantings.filter((p) => p.parentId !== id),
      });
    },

    // --- Plantings ---

    addPlanting: (opts) => {
      if (isLocked('plantings')) return;
      const { plantings, structures, zones } = get().garden;
      const newPlantings = [...plantings, createPlanting(opts)];
      const parent = structures.find((s) => s.id === opts.parentId)
        ?? zones.find((z) => z.id === opts.parentId);
      if (parent) {
        commitPatch({ plantings: rearrangePlantings(newPlantings, opts.parentId, parent) });
      } else {
        commitPatch({ plantings: newPlantings });
      }
    },

    updatePlanting: (id, updates, opts) => {
      if (isLocked('plantings')) return;
      let newPlantings = mapCollection(get().garden.plantings, id, updates);
      if ('parentId' in updates && !opts?.skipRearrange) {
        const { structures, zones } = get().garden;
        const planting = get().garden.plantings.find((p) => p.id === id);
        // Rearrange target parent
        const targetParent = structures.find((s) => s.id === updates.parentId)
          ?? zones.find((z) => z.id === updates.parentId);
        if (targetParent) {
          newPlantings = rearrangePlantings(newPlantings, updates.parentId!, targetParent);
        }
        // Rearrange source parent if different
        if (planting && planting.parentId !== updates.parentId) {
          const srcParent = structures.find((s) => s.id === planting.parentId)
            ?? zones.find((z) => z.id === planting.parentId);
          if (srcParent) {
            newPlantings = rearrangePlantings(newPlantings, planting.parentId, srcParent);
          }
        }
      }
      patch({ plantings: newPlantings });
    },

    commitPlantingUpdate: (id, updates) => {
      if (isLocked('plantings')) return;
      let newPlantings = mapCollection(get().garden.plantings, id, updates);
      if ('parentId' in updates) {
        const { structures, zones } = get().garden;
        const planting = get().garden.plantings.find((p) => p.id === id);
        const targetParent = structures.find((s) => s.id === updates.parentId)
          ?? zones.find((z) => z.id === updates.parentId);
        if (targetParent) {
          newPlantings = rearrangePlantings(newPlantings, updates.parentId!, targetParent);
        }
        if (planting && planting.parentId !== updates.parentId) {
          const srcParent = structures.find((s) => s.id === planting.parentId)
            ?? zones.find((z) => z.id === planting.parentId);
          if (srcParent) {
            newPlantings = rearrangePlantings(newPlantings, planting.parentId, srcParent);
          }
        }
      }
      commitPatch({ plantings: newPlantings });
    },

    removePlanting: (id) => {
      if (isLocked('plantings')) return;
      commitPatch({ plantings: get().garden.plantings.filter((p) => p.id !== id) });
    },

    applyOptimizerResult: (structureId, candidate) => {
      const { garden } = get();
      const structure = garden.structures.find((s) => s.id === structureId);
      if (!structure) return;
      const IN_TO_FT = 1 / 12;
      // Remove existing plantings for this bed, add optimizer placements
      const retained = garden.plantings.filter((p) => p.parentId !== structureId);
      const newPlantings = candidate.placements.map((pl) =>
        createPlanting({
          parentId: structureId,
          cultivarId: pl.cultivarId,
          x: pl.xIn * IN_TO_FT,
          y: pl.yIn * IN_TO_FT,
        }),
      );
      commitPatch({ plantings: [...retained, ...newPlantings] });
    },

    // --- Seed Starting ---

    addTray: (tray) => {
      const { seedStarting } = get().garden;
      commitPatch({
        seedStarting: { ...seedStarting, trays: [...seedStarting.trays, tray] },
      });
    },

    /** Add a tray without creating an undo entry — used when bootstrapping seed-starting mode. */
    addTraySilent: (tray) => {
      const { seedStarting } = get().garden;
      patch({ seedStarting: { ...seedStarting, trays: [...seedStarting.trays, tray] } });
    },

    removeTray: (trayId) => {
      const { seedStarting } = get().garden;
      commitPatch({
        seedStarting: {
          ...seedStarting,
          trays: seedStarting.trays.filter((t) => t.id !== trayId),
          seedlings: seedStarting.seedlings.filter((s) => s.trayId !== trayId),
        },
      });
    },

    renameTray: (trayId, label) => {
      const { seedStarting } = get().garden;
      const tray = seedStarting.trays.find((t) => t.id === trayId);
      if (!tray || tray.label === label) return;
      commitPatch({
        seedStarting: {
          ...seedStarting,
          trays: seedStarting.trays.map((t) => (t.id === trayId ? { ...t, label } : t)),
        },
      });
    },

    reorderTrays: (fromIndex, toIndex) => {
      const { seedStarting } = get().garden;
      const n = seedStarting.trays.length;
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || fromIndex >= n) return;
      if (toIndex < 0 || toIndex >= n) return;
      const next = seedStarting.trays.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      commitPatch({ seedStarting: { ...seedStarting, trays: next } });
    },

    sowCell: (trayId, row, col, cultivarId, opts) => {
      const { seedStarting } = get().garden;
      const tray = seedStarting.trays.find((t) => t.id === trayId);
      if (!tray) return;
      const slot = getCell(tray, row, col);
      if (!slot) return;
      if (slot.state === 'sown' && !opts?.replace) return;
      const replacedId = slot.state === 'sown' ? slot.seedlingId : null;
      const seedling = createSeedling({ cultivarId, trayId, row, col });
      const updatedTray = setCell(tray, row, col, { state: 'sown', seedlingId: seedling.id });
      const filteredSeedlings = replacedId
        ? seedStarting.seedlings.filter((s) => s.id !== replacedId)
        : seedStarting.seedlings;
      commitPatch({
        seedStarting: {
          ...seedStarting,
          trays: seedStarting.trays.map((t) => (t.id === trayId ? updatedTray : t)),
          seedlings: [...filteredSeedlings, seedling],
        },
      });
    },

    fillTray: (trayId, cultivarId, opts) => {
      fillCells(trayId, cultivarId, opts?.replace ?? false, () => true);
    },

    fillRow: (trayId, row, cultivarId, opts) => {
      const { seedStarting } = get().garden;
      const tray = seedStarting.trays.find((t) => t.id === trayId);
      if (!tray || row < 0 || row >= tray.rows) return;
      fillCells(trayId, cultivarId, opts?.replace ?? false, (r, _c) => r === row);
    },

    fillColumn: (trayId, col, cultivarId, opts) => {
      const { seedStarting } = get().garden;
      const tray = seedStarting.trays.find((t) => t.id === trayId);
      if (!tray || col < 0 || col >= tray.cols) return;
      fillCells(trayId, cultivarId, opts?.replace ?? false, (_r, c) => c === col);
    },

    moveSeedling: (trayId, fromRow, fromCol, toRow, toCol) => {
      if (fromRow === toRow && fromCol === toCol) return;
      const { seedStarting } = get().garden;
      const tray = seedStarting.trays.find((t) => t.id === trayId);
      if (!tray) return;
      const fromSlot = getCell(tray, fromRow, fromCol);
      const toSlot = getCell(tray, toRow, toCol);
      if (!fromSlot || !toSlot) return;
      if (fromSlot.state !== 'sown' || !fromSlot.seedlingId) return;
      let updated = setCell(tray, toRow, toCol, { ...fromSlot });
      updated = setCell(updated, fromRow, fromCol, { ...toSlot });
      const movedIds = new Set<string>();
      if (fromSlot.seedlingId) movedIds.add(fromSlot.seedlingId);
      if (toSlot.seedlingId) movedIds.add(toSlot.seedlingId);
      const seedlings = seedStarting.seedlings.map((s) => {
        if (s.id === fromSlot.seedlingId) return { ...s, row: toRow, col: toCol };
        if (s.id === toSlot.seedlingId) return { ...s, row: fromRow, col: fromCol };
        return s;
      });
      commitPatch({
        seedStarting: {
          ...seedStarting,
          trays: seedStarting.trays.map((t) => (t.id === trayId ? updated : t)),
          seedlings,
        },
      });
    },

    moveSeedlingGroup: (trayId, moves) => {
      if (moves.length === 0) return;
      const { seedStarting } = get().garden;
      const tray = seedStarting.trays.find((t) => t.id === trayId);
      if (!tray) return;
      const movingIds = new Set(moves.map((m) => m.seedlingId));
      const seedlingById = new Map(seedStarting.seedlings.map((s) => [s.id, s]));
      // Skip the no-op case where every move keeps its seedling in place.
      let anyChange = false;
      for (const m of moves) {
        const s = seedlingById.get(m.seedlingId);
        if (!s) continue;
        if (s.row !== m.toRow || s.col !== m.toCol) {
          anyChange = true;
          break;
        }
      }
      if (!anyChange) return;
      // Start from a tray where every moving seedling's old slot is cleared.
      const slots = tray.slots.slice();
      for (const m of moves) {
        const s = seedlingById.get(m.seedlingId);
        if (!s || s.row == null || s.col == null) continue;
        const idx = s.row * tray.cols + s.col;
        if (slots[idx]?.seedlingId === m.seedlingId) {
          slots[idx] = { state: 'empty', seedlingId: null };
        }
      }
      // Then place each move into its target.
      for (const m of moves) {
        slots[m.toRow * tray.cols + m.toCol] = { state: 'sown', seedlingId: m.seedlingId };
      }
      const updatedTray = { ...tray, slots };
      const seedlings = seedStarting.seedlings.map((s) => {
        if (!movingIds.has(s.id)) return s;
        const m = moves.find((mm) => mm.seedlingId === s.id)!;
        return { ...s, trayId, row: m.toRow, col: m.toCol };
      });
      commitPatch({
        seedStarting: {
          ...seedStarting,
          trays: seedStarting.trays.map((t) => (t.id === trayId ? updatedTray : t)),
          seedlings,
        },
      });
    },

    moveSeedlingsAcrossTrays: (moves) => {
      if (moves.length === 0) return;
      const { seedStarting } = get().garden;
      const seedlingById = new Map(seedStarting.seedlings.map((s) => [s.id, s]));
      const trayById = new Map(seedStarting.trays.map((t) => [t.id, t]));

      // Validate every move references known entities and fits in its dest.
      for (const m of moves) {
        const tray = trayById.get(m.toTrayId);
        if (!tray) return;
        if (!trayById.has(m.fromTrayId)) return;
        if (!seedlingById.has(m.seedlingId)) return;
        if (m.toRow < 0 || m.toRow >= tray.rows) return;
        if (m.toCol < 0 || m.toCol >= tray.cols) return;
      }

      // Skip true no-ops (every move keeps its seedling in place).
      let anyChange = false;
      for (const m of moves) {
        const s = seedlingById.get(m.seedlingId)!;
        if (s.trayId !== m.toTrayId || s.row !== m.toRow || s.col !== m.toCol) {
          anyChange = true;
          break;
        }
      }
      if (!anyChange) return;

      const movingIds = new Set(moves.map((m) => m.seedlingId));

      // Conflict check: every destination cell must be free, or occupied by a
      // moving seedling. Reject the whole batch on any collision with a
      // non-mover. Also detect duplicate destinations within the batch.
      const destKey = (trayId: string, r: number, c: number) => `${trayId}:${r},${c}`;
      const destSeen = new Set<string>();
      for (const m of moves) {
        const k = destKey(m.toTrayId, m.toRow, m.toCol);
        if (destSeen.has(k)) return; // two moves into same dest cell
        destSeen.add(k);
        const tray = trayById.get(m.toTrayId)!;
        const slot = tray.slots[m.toRow * tray.cols + m.toCol];
        if (slot.state === 'sown' && slot.seedlingId && !movingIds.has(slot.seedlingId)) {
          return; // collision with a non-mover → reject batch
        }
      }

      // Apply: clone every affected tray's slots; clear sources first, then
      // place destinations.
      const affectedTrayIds = new Set<string>();
      for (const m of moves) {
        affectedTrayIds.add(m.fromTrayId);
        affectedTrayIds.add(m.toTrayId);
      }
      const slotsByTrayId = new Map<string, Tray['slots']>();
      for (const id of affectedTrayIds) {
        const t = trayById.get(id)!;
        slotsByTrayId.set(id, t.slots.slice());
      }

      for (const m of moves) {
        const s = seedlingById.get(m.seedlingId)!;
        if (s.trayId && s.row != null && s.col != null) {
          const slots = slotsByTrayId.get(s.trayId);
          if (slots) {
            const idx = s.row * trayById.get(s.trayId)!.cols + s.col;
            if (slots[idx]?.seedlingId === m.seedlingId) {
              slots[idx] = { state: 'empty', seedlingId: null };
            }
          }
        }
      }
      for (const m of moves) {
        const slots = slotsByTrayId.get(m.toTrayId)!;
        const tray = trayById.get(m.toTrayId)!;
        slots[m.toRow * tray.cols + m.toCol] = { state: 'sown', seedlingId: m.seedlingId };
      }

      const newTrays = seedStarting.trays.map((t) => {
        const slots = slotsByTrayId.get(t.id);
        return slots ? { ...t, slots } : t;
      });
      const newSeedlings = seedStarting.seedlings.map((s) => {
        if (!movingIds.has(s.id)) return s;
        const m = moves.find((mm) => mm.seedlingId === s.id)!;
        return { ...s, trayId: m.toTrayId, row: m.toRow, col: m.toCol };
      });

      commitPatch({
        seedStarting: { ...seedStarting, trays: newTrays, seedlings: newSeedlings },
      });
    },

    clearCell: (trayId, row, col) => {
      const { seedStarting } = get().garden;
      const tray = seedStarting.trays.find((t) => t.id === trayId);
      if (!tray) return;
      const slot = getCell(tray, row, col);
      if (!slot || slot.state === 'empty') return;
      const seedlingId = slot.seedlingId;
      const updatedTray = setCell(tray, row, col, { state: 'empty', seedlingId: null });
      commitPatch({
        seedStarting: {
          ...seedStarting,
          trays: seedStarting.trays.map((t) => (t.id === trayId ? updatedTray : t)),
          seedlings: seedStarting.seedlings.filter((s) => s.id !== seedlingId),
        },
      });
    },

    // --- History ---

    checkpoint: () => {
      pushHistory(get().garden, useUiStore.getState().selectedIds);
    },

    undo: () => {
      const prev = undo(get().garden, useUiStore.getState().selectedIds);
      if (prev) {
        set({ garden: prev.garden });
        useUiStore.getState().setSelection(scrubSelection(prev.selectedIds, prev.garden));
      }
    },

    redo: () => {
      const next = redo(get().garden, useUiStore.getState().selectedIds);
      if (next) {
        set({ garden: next.garden });
        useUiStore.getState().setSelection(scrubSelection(next.selectedIds, next.garden));
      }
    },

    canUndo,
    canRedo,
  };
});
