import { emptyNurseryState } from '../model/nursery';
import type { Garden, Structure, Zone } from '../model/types';
import { PLANTABLE_TYPES, getPlantableBounds } from '../model/types';
import { getCultivar } from '../model/cultivars';
import type { Cultivar } from '../model/cultivars';
import { computeOccupancy, nearestFreeCellCenter, resolveFootprint } from '../model/cellOccupancy';

/**
 * Project the collection to the on-disk form: builtin cultivars become
 * `{ id }` references; custom cultivars (id not in the global database)
 * keep their full data so the file is self-contained for them.
 *
 * The runtime shape stays `Cultivar[]` — we re-hydrate on deserialize.
 * Older files with full Cultivar objects for builtins are still accepted.
 */
function projectCollectionForExport(collection: Cultivar[] | undefined): Array<{ id: string } | Cultivar> {
  return (collection ?? []).map((c) => (getCultivar(c.id) ? { id: c.id } : c));
}

function hydrateCollection(raw: unknown): Cultivar[] {
  if (!Array.isArray(raw)) return [];
  const out: Cultivar[] = [];
  for (const entry of raw) {
    const id = (entry as { id?: string } | string | null)?.constructor === String
      ? (entry as unknown as string)
      : (entry as { id?: string } | null)?.id;
    if (!id) continue;
    const builtin = getCultivar(id);
    if (builtin) {
      out.push(builtin);
      continue;
    }
    // Custom cultivar — must have the full Cultivar shape inline.
    if (typeof entry === 'object' && entry !== null && typeof (entry as Cultivar).color === 'string') {
      out.push(entry as Cultivar);
    }
  }
  return out;
}

export function serializeGarden(garden: Garden): string {
  return JSON.stringify(
    { ...garden, collection: projectCollectionForExport(garden.collection) },
    null,
    2,
  );
}

export function deserializeGarden(json: string): Garden {
  const data = JSON.parse(json);
  migrateHeightToLength(data);
  if (!data.version || !data.name || data.widthFt == null || data.lengthFt == null) {
    throw new Error('Invalid garden file: missing required fields');
  }
  // Migrate legacy `seedStarting` field (the old name for the nursery
  // mode-state) to `nursery`. Keeps older .garden files loadable.
  if (data && typeof data === 'object' && data.seedStarting && !data.nursery) {
    data.nursery = data.seedStarting;
    delete data.seedStarting;
  }
  if (!data.nursery) data.nursery = emptyNurseryState();
  data.collection = hydrateCollection(data.collection);
  migrateLayoutsToCellGrid(data as Garden);
  snapPlantingsToCellGrid(data as Garden);
  return data as Garden;
}

const DEFAULT_CELL_SIZE_FT = 1 / 6; // 2 inches

/**
 * Give plantable structures (and zones) a default cell-grid layout when they
 * load without one — covers files saved before cell-grid existed and files
 * with the legacy `arrangement: ...` shape that's no longer in the model.
 * Existing valid layouts (`single`, `snap-points`, `grid`, `cell-grid`)
 * are preserved.
 */
function migrateLayoutsToCellGrid(garden: Garden): void {
  const KNOWN_LAYOUT_TYPES = new Set(['single', 'grid', 'cell-grid', 'snap-points']);
  for (const s of garden.structures) {
    if (!PLANTABLE_TYPES.has(s.type)) continue;
    const t = s.layout?.type;
    if (t && KNOWN_LAYOUT_TYPES.has(t)) continue;
    // Pots and felt-planters keep their classic 'single' default; raised-beds
    // (and anything else plantable) get cell-grid.
    if (s.type === 'pot' || s.type === 'felt-planter') {
      s.layout = { type: 'single' };
    } else {
      s.layout = { type: 'cell-grid', cellSizeFt: DEFAULT_CELL_SIZE_FT };
    }
  }
  for (const z of garden.zones) {
    const t = z.layout?.type;
    if (t && KNOWN_LAYOUT_TYPES.has(t)) continue;
    z.layout = { type: 'cell-grid', cellSizeFt: DEFAULT_CELL_SIZE_FT };
  }
}

/**
 * For each plant in a `cell-grid` parent, snap its position to the nearest
 * valid cell that doesn't conflict with already-snapped plants. Walks plants
 * in array order; earlier plants claim their cells first. Plants whose
 * cultivar is unknown are left in place.
 */
function snapPlantingsToCellGrid(garden: Garden): void {
  const parents = new Map<string, Structure | Zone>();
  for (const s of garden.structures) parents.set(s.id, s);
  for (const z of garden.zones) parents.set(z.id, z);

  // Per-parent footprint accumulator (world coords) for the running occupancy.
  const placedByParent = new Map<string, ReturnType<typeof resolveFootprint>[]>();

  for (const p of garden.plantings) {
    const parent = parents.get(p.parentId);
    if (!parent || parent.layout?.type !== 'cell-grid') continue;
    const cultivar = getCultivar(p.cultivarId);
    if (!cultivar) continue;
    const cellSize = parent.layout.cellSizeFt;
    const bounds = getPlantableBounds(parent as Parameters<typeof getPlantableBounds>[0]);
    const placed = (placedByParent.get(p.parentId) ?? []).filter(
      (f): f is NonNullable<typeof f> => f !== null,
    );
    const { occupied } = computeOccupancy({ bounds, cellSizeFt: cellSize, plantings: placed });
    const r = (cultivar.footprintFt ?? 0.5) / 2;
    const worldX = parent.x + p.x;
    const worldY = parent.y + p.y;
    const cell = nearestFreeCellCenter(bounds, cellSize, occupied, r, worldX, worldY);
    if (cell) {
      p.x = cell.x - parent.x;
      p.y = cell.y - parent.y;
    }
    const fp = resolveFootprint({ cultivarId: p.cultivarId, x: p.x, y: p.y }, parent.x, parent.y);
    if (fp) placedByParent.set(p.parentId, [...placed, fp]);
  }
}


function migrateHeightToLength(data: Record<string, unknown>): void {
  if (data.lengthFt == null && data.heightFt != null) {
    data.lengthFt = data.heightFt;
    delete data.heightFt;
  }
  for (const arr of [data.structures, data.zones]) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (item && typeof item === 'object' && (item as Record<string, unknown>).length == null && (item as Record<string, unknown>).height != null) {
        (item as Record<string, unknown>).length = (item as Record<string, unknown>).height;
        delete (item as Record<string, unknown>).height;
      }
    }
  }
}

export function downloadGarden(garden: Garden): void {
  const json = serializeGarden(garden);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${garden.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.garden`;
  a.click();
  URL.revokeObjectURL(url);
}

export function openGardenFile(): Promise<Garden> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.garden,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('No file selected'));
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(deserializeGarden(reader.result as string));
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    };
    input.click();
  });
}

const AUTOSAVE_KEY = 'garden-planner-autosave';
const COLLECTION_KEY = 'garden-planner-collection';

export function persistCollection(collection: unknown): void {
  try {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
  } catch {
    // ignore
  }
}

export function loadPersistedCollection<T>(): T | null {
  const raw = localStorage.getItem(COLLECTION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function autosave(garden: Garden): void {
  localStorage.setItem(AUTOSAVE_KEY, serializeGarden(garden));
}

export function loadAutosave(): Garden | null {
  const json = localStorage.getItem(AUTOSAVE_KEY);
  if (!json) return null;
  try {
    return deserializeGarden(json);
  } catch {
    return null;
  }
}
