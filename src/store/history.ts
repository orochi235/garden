import type { Garden } from '../model/types';

const MAX_HISTORY = 100;

export interface HistoryEntry {
  garden: Garden;
  selectedIds: string[];
}

let past: HistoryEntry[] = [];
let future: HistoryEntry[] = [];

export function pushHistory(garden: Garden, selectedIds: string[] = []): void {
  past.push({ garden: structuredClone(garden), selectedIds: [...selectedIds] });
  if (past.length > MAX_HISTORY) past.shift();
  future = [];
}

export function undo(current: Garden, currentSelectedIds: string[] = []): HistoryEntry | null {
  if (past.length === 0) return null;
  future.push({ garden: structuredClone(current), selectedIds: [...currentSelectedIds] });
  return past.pop()!;
}

export function redo(current: Garden, currentSelectedIds: string[] = []): HistoryEntry | null {
  if (future.length === 0) return null;
  past.push({ garden: structuredClone(current), selectedIds: [...currentSelectedIds] });
  return future.pop()!;
}

export function canUndo(): boolean {
  return past.length > 0;
}

export function canRedo(): boolean {
  return future.length > 0;
}

export function clearHistory(): void {
  past = [];
  future = [];
}
