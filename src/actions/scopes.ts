// src/actions/scopes.ts
import type { ScopeNode } from './types';
import { useUiStore } from '../store/uiStore';

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}

const SCOPE_TREE: ScopeNode[] = [
  { id: 'global', parent: null, active: () => true },
  { id: 'canvas', parent: 'global', active: () => !isInputFocused() },
  { id: 'structures', parent: 'canvas', active: () => useUiStore.getState().activeLayer === 'structures' },
  { id: 'zones', parent: 'canvas', active: () => useUiStore.getState().activeLayer === 'zones' },
  { id: 'plantings', parent: 'canvas', active: () => useUiStore.getState().activeLayer === 'plantings' },
  { id: 'sidebar', parent: 'global', active: () => true },
  { id: 'properties', parent: 'sidebar', active: () => useUiStore.getState().selectedIds.length > 0 },
];

const scopeMap = new Map(SCOPE_TREE.map((s) => [s.id, s]));

/** Walk from each active node upward; return the deepest fully-active path. */
export function getActiveScopePath(): string[] {
  let deepest: string[] = [];

  for (const node of SCOPE_TREE) {
    const path = buildPathUp(node.id);
    if (path.length > deepest.length) {
      deepest = path;
    }
  }

  return deepest;
}

function buildPathUp(scopeId: string): string[] {
  const path: string[] = [];
  let current: ScopeNode | undefined = scopeMap.get(scopeId);
  while (current) {
    if (!current.active()) break;
    path.push(current.id);
    current = current.parent ? scopeMap.get(current.parent) : undefined;
  }
  // Only valid if we reached the root
  if (path[path.length - 1] !== 'global') return [];
  return path;
}

export { SCOPE_TREE, scopeMap };
