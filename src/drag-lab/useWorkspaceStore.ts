import { create } from 'zustand';
import type { WorkspaceState, SavedState, LabItem, ContainerShape } from './types';
import { getStrategy } from './strategies';

const STORAGE_KEY = 'drag-lab-workspaces';
const SAVES_KEY = 'drag-lab-saves';

function generateId(): string {
  return crypto.randomUUID();
}

function createDefaultWorkspace(): WorkspaceState {
  return {
    id: generateId(),
    strategyName: 'Free-form',
    config: getStrategy('Free-form').defaultConfig(),
    containerWidth: 4,
    containerHeight: 4,
    containerShape: 'rectangle',
    items: [],
    paletteMode: 'generic',
    genericRadius: 0.25,
    expandToFill: false,
  };
}

function loadWorkspaces(): WorkspaceState[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [createDefaultWorkspace()];
}

function saveWorkspaces(workspaces: WorkspaceState[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
}

function loadSaves(): SavedState[] {
  try {
    const raw = localStorage.getItem(SAVES_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function persistSaves(saves: SavedState[]): void {
  localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
}

const MAX_UNDO = 50;

interface UndoStack {
  past: LabItem[][];
  future: LabItem[][];
}

interface WorkspaceStore {
  workspaces: WorkspaceState[];
  saves: SavedState[];
  /** Per-workspace undo stacks (session only, not persisted). */
  undoStacks: Record<string, UndoStack>;
  addWorkspace: () => void;
  cloneWorkspace: (id: string) => void;
  removeWorkspace: (id: string) => void;
  updateWorkspace: (id: string, patch: Partial<WorkspaceState>) => void;
  setStrategy: (id: string, strategyName: string) => void;
  setConfig: (id: string, key: string, value: unknown) => void;
  addItem: (id: string, item: LabItem) => void;
  removeItem: (workspaceId: string, itemId: string) => void;
  setContainerSize: (id: string, width: number, height: number) => void;
  setContainerShape: (id: string, shape: ContainerShape) => void;
  saveState: (workspaceId: string, name: string) => void;
  loadState: (workspaceId: string, save: SavedState) => void;
  resetWorkspace: (id: string) => void;
  resetAll: () => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  canUndo: (id: string) => boolean;
  canRedo: (id: string) => boolean;
}

function getStack(stacks: Record<string, UndoStack>, id: string): UndoStack {
  return stacks[id] ?? { past: [], future: [] };
}

function pushSnapshot(stacks: Record<string, UndoStack>, id: string, items: LabItem[]): Record<string, UndoStack> {
  const stack = getStack(stacks, id);
  const past = [...stack.past, items].slice(-MAX_UNDO);
  return { ...stacks, [id]: { past, future: [] } };
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: loadWorkspaces(),
  saves: loadSaves(),
  undoStacks: {},

  addWorkspace: () =>
    set((s) => {
      const workspaces = [...s.workspaces, createDefaultWorkspace()];
      saveWorkspaces(workspaces);
      return { workspaces };
    }),

  cloneWorkspace: (id) =>
    set((s) => {
      const source = s.workspaces.find((w) => w.id === id);
      if (!source) return s;
      const clone: WorkspaceState = { ...source, id: generateId(), items: source.items.map((i) => ({ ...i, id: generateId() })) };
      const workspaces = [...s.workspaces, clone];
      saveWorkspaces(workspaces);
      return { workspaces };
    }),

  removeWorkspace: (id) =>
    set((s) => {
      const workspaces = s.workspaces.filter((w) => w.id !== id);
      saveWorkspaces(workspaces);
      return { workspaces };
    }),

  updateWorkspace: (id, patch) =>
    set((s) => {
      const workspaces = s.workspaces.map((w) => (w.id === id ? { ...w, ...patch } : w));
      saveWorkspaces(workspaces);
      return { workspaces };
    }),

  setStrategy: (id, strategyName) =>
    set((s) => {
      const strategy = getStrategy(strategyName);
      const workspaces = s.workspaces.map((w) =>
        w.id === id ? { ...w, strategyName, config: strategy.defaultConfig() } : w,
      );
      saveWorkspaces(workspaces);
      return { workspaces };
    }),

  setConfig: (id, key, value) =>
    set((s) => {
      const current = s.workspaces.find((w) => w.id === id);
      // Snapshot on layer reorder
      const undoStacks = key === 'layerOrder' && current
        ? pushSnapshot(s.undoStacks, id, current.items)
        : s.undoStacks;
      const workspaces = s.workspaces.map((w) =>
        w.id === id ? { ...w, config: { ...w.config, [key]: value } } : w,
      );
      saveWorkspaces(workspaces);
      return { workspaces, undoStacks };
    }),

  addItem: (id, item) =>
    set((s) => {
      const current = s.workspaces.find((w) => w.id === id);
      const undoStacks = current ? pushSnapshot(s.undoStacks, id, current.items) : s.undoStacks;
      const workspaces = s.workspaces.map((w) =>
        w.id === id ? { ...w, items: [...w.items, item] } : w,
      );
      saveWorkspaces(workspaces);
      return { workspaces, undoStacks };
    }),

  removeItem: (workspaceId, itemId) =>
    set((s) => {
      const current = s.workspaces.find((w) => w.id === workspaceId);
      const undoStacks = current ? pushSnapshot(s.undoStacks, workspaceId, current.items) : s.undoStacks;
      const workspaces = s.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, items: w.items.filter((i) => i.id !== itemId) } : w,
      );
      saveWorkspaces(workspaces);
      return { workspaces, undoStacks };
    }),

  setContainerSize: (id, width, height) =>
    set((s) => {
      const workspaces = s.workspaces.map((w) =>
        w.id === id ? { ...w, containerWidth: width, containerHeight: height } : w,
      );
      saveWorkspaces(workspaces);
      return { workspaces };
    }),

  setContainerShape: (id, shape) =>
    set((s) => {
      const workspaces = s.workspaces.map((w) =>
        w.id === id ? { ...w, containerShape: shape } : w,
      );
      saveWorkspaces(workspaces);
      return { workspaces };
    }),

  saveState: (workspaceId, name) =>
    set((s) => {
      const workspace = s.workspaces.find((w) => w.id === workspaceId);
      if (!workspace) return s;
      const save: SavedState = { name, timestamp: Date.now(), workspace: { ...workspace } };
      const saves = [...s.saves, save];
      persistSaves(saves);
      return { saves };
    }),

  loadState: (workspaceId, save) =>
    set((s) => {
      const workspaces = s.workspaces.map((w) =>
        w.id === workspaceId ? { ...save.workspace, id: workspaceId } : w,
      );
      saveWorkspaces(workspaces);
      return { workspaces };
    }),

  resetWorkspace: (id) =>
    set((s) => {
      const current = s.workspaces.find((w) => w.id === id);
      const strategy = current ? getStrategy(current.strategyName) : getStrategy('Free-form');
      const strategyName = current?.strategyName ?? 'Free-form';
      const workspaces = s.workspaces.map((w) =>
        w.id === id
          ? { ...createDefaultWorkspace(), id, strategyName, config: strategy.defaultConfig() }
          : w,
      );
      saveWorkspaces(workspaces);
      return { workspaces };
    }),

  resetAll: () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SAVES_KEY);
    set({ workspaces: [createDefaultWorkspace()], saves: [], undoStacks: {} });
  },

  undo: (id) =>
    set((s) => {
      const stack = getStack(s.undoStacks, id);
      if (stack.past.length === 0) return s;
      const current = s.workspaces.find((w) => w.id === id);
      if (!current) return s;
      const prev = stack.past[stack.past.length - 1];
      const undoStacks = {
        ...s.undoStacks,
        [id]: {
          past: stack.past.slice(0, -1),
          future: [current.items, ...stack.future],
        },
      };
      const workspaces = s.workspaces.map((w) =>
        w.id === id ? { ...w, items: prev } : w,
      );
      saveWorkspaces(workspaces);
      return { workspaces, undoStacks };
    }),

  redo: (id) =>
    set((s) => {
      const stack = getStack(s.undoStacks, id);
      if (stack.future.length === 0) return s;
      const current = s.workspaces.find((w) => w.id === id);
      if (!current) return s;
      const next = stack.future[0];
      const undoStacks = {
        ...s.undoStacks,
        [id]: {
          past: [...stack.past, current.items],
          future: stack.future.slice(1),
        },
      };
      const workspaces = s.workspaces.map((w) =>
        w.id === id ? { ...w, items: next } : w,
      );
      saveWorkspaces(workspaces);
      return { workspaces, undoStacks };
    }),

  canUndo: (id) => {
    const stack = getStack(get().undoStacks, id);
    return stack.past.length > 0;
  },

  canRedo: (id) => {
    const stack = getStack(get().undoStacks, id);
    return stack.future.length > 0;
  },
}));
