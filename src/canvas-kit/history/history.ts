import type { Op } from '../ops/types';

interface Entry {
  ops: Op[];
  label: string;
}

export interface History {
  apply(op: Op, label?: string): void;
  applyBatch(ops: Op[], label: string): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
}

export function createHistory(adapter: unknown): History {
  const undoStack: Entry[] = [];
  const redoStack: Entry[] = [];

  function applyEntry(entry: Entry) {
    for (const op of entry.ops) op.apply(adapter);
  }

  function invertEntry(entry: Entry): Entry {
    return {
      ops: [...entry.ops].reverse().map((op) => op.invert()),
      label: entry.label,
    };
  }

  return {
    apply(op, label) {
      const entry: Entry = { ops: [op], label: label ?? op.label ?? '' };
      applyEntry(entry);
      undoStack.push(entry);
      redoStack.length = 0;
    },
    applyBatch(ops, label) {
      if (ops.length === 0) return;
      const entry: Entry = { ops, label };
      applyEntry(entry);
      undoStack.push(entry);
      redoStack.length = 0;
    },
    undo() {
      const entry = undoStack.pop();
      if (!entry) return;
      applyEntry(invertEntry(entry));
      redoStack.push(entry);
    },
    redo() {
      const entry = redoStack.pop();
      if (!entry) return;
      applyEntry(entry);
      undoStack.push(entry);
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    clear: () => {
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}
