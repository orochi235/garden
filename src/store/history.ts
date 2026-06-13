const MAX_HISTORY = 100;

export interface HistorySnapshot<T> {
  value: T;
  selectedIds: string[];
}

export interface HistoryStack<T> {
  push(value: T, selectedIds?: string[]): void;
  undo(current: T, currentSelectedIds?: string[]): HistorySnapshot<T> | null;
  redo(current: T, currentSelectedIds?: string[]): HistorySnapshot<T> | null;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
}

export function createHistoryStack<T>(): HistoryStack<T> {
  let past: HistorySnapshot<T>[] = [];
  let future: HistorySnapshot<T>[] = [];
  return {
    push(value, selectedIds = []) {
      past.push({ value: structuredClone(value), selectedIds: [...selectedIds] });
      if (past.length > MAX_HISTORY) past.shift();
      future = [];
    },
    undo(current, currentSelectedIds = []) {
      if (past.length === 0) return null;
      future.push({ value: structuredClone(current), selectedIds: [...currentSelectedIds] });
      return past.pop()!;
    },
    redo(current, currentSelectedIds = []) {
      if (future.length === 0) return null;
      past.push({ value: structuredClone(current), selectedIds: [...currentSelectedIds] });
      return future.pop()!;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    clear: () => {
      past = [];
      future = [];
    },
  };
}
