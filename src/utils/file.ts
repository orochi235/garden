import { emptySeedStartingState } from '../model/seedStarting';
import type { Garden } from '../model/types';
import { getCultivar } from '../model/cultivars';
import type { Cultivar } from '../model/cultivars';

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
  if (!data.seedStarting) data.seedStarting = emptySeedStartingState();
  data.collection = hydrateCollection(data.collection);
  return data as Garden;
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
