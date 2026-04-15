import type { Garden } from '../model/types';

const MAX_HISTORY = 100;

let past: Garden[] = [];
let future: Garden[] = [];

export function pushHistory(garden: Garden): void {
  past.push(structuredClone(garden));
  if (past.length > MAX_HISTORY) past.shift();
  future = [];
}

export function undo(current: Garden): Garden | null {
  if (past.length === 0) return null;
  future.push(structuredClone(current));
  return past.pop()!;
}

export function redo(current: Garden): Garden | null {
  if (future.length === 0) return null;
  past.push(structuredClone(current));
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
