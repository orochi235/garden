import type { Garden } from '../model/types';

export function serializeGarden(garden: Garden): string {
  return JSON.stringify(garden, null, 2);
}

export function deserializeGarden(json: string): Garden {
  const data = JSON.parse(json);
  if (!data.version || !data.name || data.widthFt == null || data.heightFt == null) {
    throw new Error('Invalid garden file: missing required fields');
  }
  return data as Garden;
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
