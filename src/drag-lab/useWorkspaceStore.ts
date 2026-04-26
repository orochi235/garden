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

interface WorkspaceStore {
  workspaces: WorkspaceState[];
  saves: SavedState[];
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
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: loadWorkspaces(),
  saves: loadSaves(),

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
      const workspaces = s.workspaces.map((w) =>
        w.id === id ? { ...w, config: { ...w.config, [key]: value } } : w,
      );
      saveWorkspaces(workspaces);
      return { workspaces };
    }),

  addItem: (id, item) =>
    set((s) => {
      const workspaces = s.workspaces.map((w) =>
        w.id === id ? { ...w, items: [...w.items, item] } : w,
      );
      saveWorkspaces(workspaces);
      return { workspaces };
    }),

  removeItem: (workspaceId, itemId) =>
    set((s) => {
      const workspaces = s.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, items: w.items.filter((i) => i.id !== itemId) } : w,
      );
      saveWorkspaces(workspaces);
      return { workspaces };
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
    set({ workspaces: [createDefaultWorkspace()], saves: [] });
  },
}));
