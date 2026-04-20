# Action Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize all user actions (keyboard shortcuts, future context menus) into a single registry with scope-tree dispatch, eliminating scattered keyboard listeners.

**Architecture:** A flat array of `ActionDescriptor` objects, organized by domain in subdirectories. A scope tree determines which actions are active. A single `useKeyboardActionDispatch` hook replaces all existing `addEventListener('keydown', ...)` calls. Non-transient actions get automatic undo checkpoints.

**Tech Stack:** TypeScript, React hooks, Zustand (existing stores), Vitest

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/actions/types.ts` | All type definitions (ActionDescriptor, Shortcut, ActionTarget, ActionContext, ScopeNode) |
| `src/actions/scopes.ts` | Scope tree registry, `getActiveScopePath()` |
| `src/actions/dispatch.ts` | `matchShortcut()`, `resolveAction()`, `deriveKeyboardTarget()` |
| `src/actions/registry.ts` | Imports all actions, exports flat array + lookup helpers |
| `src/actions/useKeyboardActionDispatch.ts` | Single React hook for keyboard dispatch |
| `src/actions/editing/undo.ts` | Undo action |
| `src/actions/editing/redo.ts` | Redo action |
| `src/actions/editing/delete.ts` | Delete selected objects |
| `src/actions/editing/copy.ts` | Copy action |
| `src/actions/editing/paste.ts` | Paste action |
| `src/actions/editing/selectAll.ts` | Select all in active layer |
| `src/actions/view/cycleViewMode.ts` | Backtick cycles view modes |
| `src/actions/layers/cycleLayer.ts` | Arrow keys cycle active layer |
| `src/actions/objects/rotate.ts` | R/Shift+R rotate selected objects |
| `src/actions/objects/duplicate.ts` | Alt-based duplicate (Cmd+D) |
| `src/actions/objects/animateRotation.ts` | Standalone rotation animation utility |

---

### Task 1: Types

**Files:**
- Create: `src/actions/types.ts`
- Test: `src/actions/types.test.ts`

- [ ] **Step 1: Create type definitions**

```ts
// src/actions/types.ts

export interface Shortcut {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export type ActionTarget =
  | { kind: 'selection' }
  | { kind: 'objects'; ids: string[] }
  | { kind: 'layer'; layer: string }
  | { kind: 'none' };

export interface ActionContext {
  clipboard: { copy: () => void; paste: () => void; isEmpty: () => boolean };
  target?: ActionTarget;
}

export interface ActionDescriptor {
  id: string;
  label: string;
  icon?: string;
  shortcut?: Shortcut | Shortcut[];
  scope: string;
  targets: ActionTarget['kind'][];
  transient?: boolean;
  execute: (ctx: ActionContext) => void;
  isValidTarget?: (target: ActionTarget, ctx: ActionContext) => boolean;
  canExecute?: (ctx: ActionContext) => boolean;
}

export interface ScopeNode {
  id: string;
  parent: string | null;
  active: () => boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/types.ts
git commit -m "feat(actions): add type definitions for action registry"
```

---

### Task 2: Scope Tree

**Files:**
- Create: `src/actions/scopes.ts`
- Test: `src/actions/scopes.test.ts`

- [ ] **Step 1: Write failing tests for scope resolution**

```ts
// src/actions/scopes.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getActiveScopePath } from './scopes';
import { useUiStore } from '../store/uiStore';

describe('getActiveScopePath', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
  });

  it('returns [structures, canvas, global] when structures layer is active and no input focused', () => {
    useUiStore.getState().setActiveLayer('structures');
    const path = getActiveScopePath();
    expect(path).toEqual(['structures', 'canvas', 'global']);
  });

  it('returns [global] when an input element is focused', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const path = getActiveScopePath();
    expect(path).toEqual(['sidebar', 'global']);
    document.body.removeChild(input);
  });

  it('returns [zones, canvas, global] when zones layer is active', () => {
    useUiStore.getState().setActiveLayer('zones');
    const path = getActiveScopePath();
    expect(path).toEqual(['zones', 'canvas', 'global']);
  });

  it('includes properties scope when selection is non-empty', () => {
    useUiStore.getState().select('some-id');
    const path = getActiveScopePath();
    expect(path).toContain('properties');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/scopes.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement scope tree**

```ts
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

/** Walk from each leaf upward; return the deepest active path. */
export function getActiveScopePath(): string[] {
  // Find all leaf scopes (those that are not a parent of anything)
  const parents = new Set(SCOPE_TREE.map((s) => s.parent).filter(Boolean));
  const leaves = SCOPE_TREE.filter((s) => !parents.has(s.id));

  let deepest: string[] = [];

  for (const leaf of leaves) {
    const path = buildPathUp(leaf.id);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/scopes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/scopes.ts src/actions/scopes.test.ts
git commit -m "feat(actions): implement scope tree with activation resolution"
```

---

### Task 3: Dispatch Logic

**Files:**
- Create: `src/actions/dispatch.ts`
- Test: `src/actions/dispatch.test.ts`

- [ ] **Step 1: Write failing tests for shortcut matching and action resolution**

```ts
// src/actions/dispatch.test.ts
import { describe, expect, it } from 'vitest';
import { matchShortcut, resolveAction, deriveKeyboardTarget } from './dispatch';
import type { ActionDescriptor, Shortcut } from './types';

describe('matchShortcut', () => {
  it('matches a simple key', () => {
    const shortcut: Shortcut = { key: 'r' };
    const event = new KeyboardEvent('keydown', { key: 'r' });
    expect(matchShortcut(event, shortcut)).toBe(true);
  });

  it('matches meta+key', () => {
    const shortcut: Shortcut = { key: 'z', meta: true };
    const event = new KeyboardEvent('keydown', { key: 'z', metaKey: true });
    expect(matchShortcut(event, shortcut)).toBe(true);
  });

  it('rejects when modifier missing', () => {
    const shortcut: Shortcut = { key: 'z', meta: true };
    const event = new KeyboardEvent('keydown', { key: 'z' });
    expect(matchShortcut(event, shortcut)).toBe(false);
  });

  it('rejects when extra modifier present', () => {
    const shortcut: Shortcut = { key: 'z' };
    const event = new KeyboardEvent('keydown', { key: 'z', metaKey: true });
    expect(matchShortcut(event, shortcut)).toBe(false);
  });

  it('matches shift+key', () => {
    const shortcut: Shortcut = { key: 'R', shift: true };
    const event = new KeyboardEvent('keydown', { key: 'R', shiftKey: true });
    expect(matchShortcut(event, shortcut)).toBe(true);
  });
});

describe('resolveAction', () => {
  const deleteAction: ActionDescriptor = {
    id: 'editing.delete',
    label: 'Delete',
    scope: 'canvas',
    targets: ['selection'],
    execute: () => {},
  };

  const undoAction: ActionDescriptor = {
    id: 'editing.undo',
    label: 'Undo',
    shortcut: { key: 'z', meta: true },
    scope: 'global',
    targets: ['none'],
    transient: true,
    execute: () => {},
  };

  it('resolves deepest matching scope first', () => {
    const structuresDelete: ActionDescriptor = {
      ...deleteAction,
      id: 'structures.delete',
      scope: 'structures',
      shortcut: { key: 'Backspace' },
    };
    const canvasDelete: ActionDescriptor = {
      ...deleteAction,
      shortcut: { key: 'Backspace' },
    };

    const event = new KeyboardEvent('keydown', { key: 'Backspace' });
    const activePath = ['structures', 'canvas', 'global'];
    const ctx = { clipboard: { copy: () => {}, paste: () => {}, isEmpty: () => true } };

    const result = resolveAction(event, activePath, [structuresDelete, canvasDelete], ctx);
    expect(result?.id).toBe('structures.delete');
  });

  it('bubbles up when canExecute rejects', () => {
    const structuresDelete: ActionDescriptor = {
      ...deleteAction,
      id: 'structures.delete',
      scope: 'structures',
      shortcut: { key: 'Backspace' },
      canExecute: () => false,
    };
    const canvasDelete: ActionDescriptor = {
      ...deleteAction,
      shortcut: { key: 'Backspace' },
    };

    const event = new KeyboardEvent('keydown', { key: 'Backspace' });
    const activePath = ['structures', 'canvas', 'global'];
    const ctx = { clipboard: { copy: () => {}, paste: () => {}, isEmpty: () => true } };

    const result = resolveAction(event, activePath, [structuresDelete, canvasDelete], ctx);
    expect(result?.id).toBe('editing.delete');
  });

  it('returns null when no action matches', () => {
    const event = new KeyboardEvent('keydown', { key: 'q' });
    const activePath = ['canvas', 'global'];
    const ctx = { clipboard: { copy: () => {}, paste: () => {}, isEmpty: () => true } };

    const result = resolveAction(event, activePath, [undoAction], ctx);
    expect(result).toBeNull();
  });
});

describe('deriveKeyboardTarget', () => {
  it('returns selection target for actions accepting selection', () => {
    const action: ActionDescriptor = {
      id: 'test',
      label: 'Test',
      scope: 'canvas',
      targets: ['selection', 'objects'],
      execute: () => {},
    };
    expect(deriveKeyboardTarget(action)).toEqual({ kind: 'selection' });
  });

  it('returns none target for global-only actions', () => {
    const action: ActionDescriptor = {
      id: 'test',
      label: 'Test',
      scope: 'global',
      targets: ['none'],
      execute: () => {},
    };
    expect(deriveKeyboardTarget(action)).toEqual({ kind: 'none' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/dispatch.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement dispatch logic**

```ts
// src/actions/dispatch.ts
import type { ActionContext, ActionDescriptor, ActionTarget, Shortcut } from './types';

export function matchShortcut(event: KeyboardEvent, shortcut: Shortcut): boolean {
  if (event.key !== shortcut.key) return false;
  if (!!shortcut.meta !== (event.metaKey || event.ctrlKey)) return false;
  if (!!shortcut.shift !== event.shiftKey) return false;
  if (!!shortcut.alt !== event.altKey) return false;
  // ctrl is treated as alias for meta (cross-platform)
  return true;
}

function matchesAnyShortcut(event: KeyboardEvent, shortcut: Shortcut | Shortcut[]): boolean {
  const shortcuts = Array.isArray(shortcut) ? shortcut : [shortcut];
  return shortcuts.some((s) => matchShortcut(event, s));
}

export function resolveAction(
  event: KeyboardEvent,
  activePath: string[],
  actions: ActionDescriptor[],
  ctx: ActionContext,
): ActionDescriptor | null {
  // Filter to actions whose shortcut matches this event
  const matching = actions.filter((a) => a.shortcut && matchesAnyShortcut(event, a.shortcut));
  if (matching.length === 0) return null;

  // Walk from deepest scope to shallowest
  for (const scopeId of activePath) {
    const scopeActions = matching.filter((a) => a.scope === scopeId);
    for (const action of scopeActions) {
      const target = deriveKeyboardTarget(action);
      const ctxWithTarget = { ...ctx, target };
      if (action.isValidTarget && !action.isValidTarget(target, ctxWithTarget)) continue;
      if (action.canExecute && !action.canExecute(ctxWithTarget)) continue;
      return action;
    }
  }

  return null;
}

export function deriveKeyboardTarget(action: ActionDescriptor): ActionTarget {
  if (action.targets.includes('selection')) return { kind: 'selection' };
  if (action.targets.includes('layer')) {
    // For keyboard, layer target is the active layer — but we don't access store here.
    // The action's execute() will read activeLayer itself.
    return { kind: 'layer', layer: '' };
  }
  return { kind: 'none' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/dispatch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/dispatch.ts src/actions/dispatch.test.ts
git commit -m "feat(actions): implement shortcut matching and scope-aware dispatch"
```

---

### Task 4: Action Definitions — Editing

**Files:**
- Create: `src/actions/editing/undo.ts`
- Create: `src/actions/editing/redo.ts`
- Create: `src/actions/editing/delete.ts`
- Create: `src/actions/editing/copy.ts`
- Create: `src/actions/editing/paste.ts`
- Create: `src/actions/editing/selectAll.ts`
- Test: `src/actions/editing/editing.test.ts`

- [ ] **Step 1: Write tests for editing actions**

```ts
// src/actions/editing/editing.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import type { ActionContext } from '../types';
import { undoAction } from './undo';
import { redoAction } from './redo';
import { deleteAction } from './delete';
import { copyAction } from './copy';
import { pasteAction } from './paste';
import { selectAllAction } from './selectAll';

function makeCtx(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    clipboard: { copy: vi.fn(), paste: vi.fn(), isEmpty: vi.fn(() => false) },
    ...overrides,
  };
}

describe('editing actions', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
  });

  it('undo reverts last change', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
    undoAction.execute(makeCtx());
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
  });

  it('redo restores undone change', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().undo();
    redoAction.execute(makeCtx());
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
  });

  it('delete removes selected objects', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);
    deleteAction.execute(makeCtx({ target: { kind: 'selection' } }));
    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
    expect(useUiStore.getState().selectedIds).toHaveLength(0);
  });

  it('copy calls clipboard.copy', () => {
    const ctx = makeCtx();
    copyAction.execute(ctx);
    expect(ctx.clipboard.copy).toHaveBeenCalled();
  });

  it('paste calls clipboard.paste', () => {
    const ctx = makeCtx();
    pasteAction.execute(ctx);
    expect(ctx.clipboard.paste).toHaveBeenCalled();
  });

  it('selectAll selects all objects in active layer', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().addStructure({ type: 'pot', x: 5, y: 5, width: 2, height: 2 });
    useUiStore.getState().setActiveLayer('structures');
    selectAllAction.execute(makeCtx({ target: { kind: 'none' } }));
    expect(useUiStore.getState().selectedIds).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/editing/editing.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement editing actions**

```ts
// src/actions/editing/undo.ts
import type { ActionDescriptor } from '../types';
import { useGardenStore } from '../../store/gardenStore';

export const undoAction: ActionDescriptor = {
  id: 'editing.undo',
  label: 'Undo',
  shortcut: { key: 'z', meta: true },
  scope: 'global',
  targets: ['none'],
  transient: true,
  canExecute: () => useGardenStore.getState().canUndo(),
  execute: () => {
    useGardenStore.getState().undo();
  },
};
```

```ts
// src/actions/editing/redo.ts
import type { ActionDescriptor } from '../types';
import { useGardenStore } from '../../store/gardenStore';

export const redoAction: ActionDescriptor = {
  id: 'editing.redo',
  label: 'Redo',
  shortcut: { key: 'z', meta: true, shift: true },
  scope: 'global',
  targets: ['none'],
  transient: true,
  canExecute: () => useGardenStore.getState().canRedo(),
  execute: () => {
    useGardenStore.getState().redo();
  },
};
```

```ts
// src/actions/editing/delete.ts
import type { ActionDescriptor } from '../types';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';

export const deleteAction: ActionDescriptor = {
  id: 'editing.delete',
  label: 'Delete',
  shortcut: [{ key: 'Delete' }, { key: 'Backspace' }],
  scope: 'canvas',
  targets: ['selection', 'objects'],
  canExecute: () => useUiStore.getState().selectedIds.length > 0,
  execute: () => {
    const ids = useUiStore.getState().selectedIds;
    const { garden, removeStructure, removeZone, removePlanting } = useGardenStore.getState();
    for (const id of ids) {
      if (garden.structures.find((s) => s.id === id)) removeStructure(id);
      else if (garden.zones.find((z) => z.id === id)) removeZone(id);
      else if (garden.plantings.find((p) => p.id === id)) removePlanting(id);
    }
    useUiStore.getState().clearSelection();
  },
};
```

```ts
// src/actions/editing/copy.ts
import type { ActionDescriptor } from '../types';

export const copyAction: ActionDescriptor = {
  id: 'editing.copy',
  label: 'Copy',
  shortcut: { key: 'c', meta: true },
  scope: 'canvas',
  targets: ['selection'],
  transient: true,
  execute: (ctx) => {
    ctx.clipboard.copy();
  },
};
```

```ts
// src/actions/editing/paste.ts
import type { ActionDescriptor } from '../types';

export const pasteAction: ActionDescriptor = {
  id: 'editing.paste',
  label: 'Paste',
  shortcut: { key: 'v', meta: true },
  scope: 'canvas',
  targets: ['none'],
  canExecute: (ctx) => !ctx.clipboard.isEmpty(),
  execute: (ctx) => {
    ctx.clipboard.paste();
  },
};
```

```ts
// src/actions/editing/selectAll.ts
import type { ActionDescriptor } from '../types';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';

export const selectAllAction: ActionDescriptor = {
  id: 'editing.selectAll',
  label: 'Select All',
  shortcut: { key: 'a', meta: true },
  scope: 'canvas',
  targets: ['none'],
  transient: true,
  execute: () => {
    const { activeLayer } = useUiStore.getState();
    const { garden } = useGardenStore.getState();

    let ids: string[] = [];
    if (activeLayer === 'structures') {
      ids = garden.structures.map((s) => s.id);
    } else if (activeLayer === 'zones') {
      ids = garden.zones.map((z) => z.id);
    } else if (activeLayer === 'plantings') {
      ids = garden.plantings.map((p) => p.id);
    }

    if (ids.length > 0) {
      useUiStore.getState().select(ids[0]);
      for (let i = 1; i < ids.length; i++) {
        useUiStore.getState().addToSelection(ids[i]);
      }
    }
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/editing/editing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/editing/
git commit -m "feat(actions): implement editing actions (undo, redo, delete, copy, paste, selectAll)"
```

---

### Task 5: Action Definitions — View & Layers

**Files:**
- Create: `src/actions/view/cycleViewMode.ts`
- Create: `src/actions/layers/cycleLayer.ts`
- Test: `src/actions/view/view.test.ts`
- Test: `src/actions/layers/layers.test.ts`

- [ ] **Step 1: Write tests**

```ts
// src/actions/view/view.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../../store/uiStore';
import { cycleViewModeAction } from './cycleViewMode';

describe('cycleViewMode action', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
  });

  it('cycles from select to draw', () => {
    useUiStore.getState().setViewMode('select');
    cycleViewModeAction.execute({ clipboard: { copy: () => {}, paste: () => {}, isEmpty: () => true } });
    expect(useUiStore.getState().viewMode).toBe('draw');
  });

  it('wraps from zoom back to select', () => {
    useUiStore.getState().setViewMode('zoom');
    cycleViewModeAction.execute({ clipboard: { copy: () => {}, paste: () => {}, isEmpty: () => true } });
    expect(useUiStore.getState().viewMode).toBe('select');
  });
});
```

```ts
// src/actions/layers/layers.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../../store/uiStore';
import { cycleLayerDownAction, cycleLayerUpAction } from './cycleLayer';
import type { ActionContext } from '../types';

const ctx: ActionContext = { clipboard: { copy: () => {}, paste: () => {}, isEmpty: () => true } };

describe('cycleLayer actions', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
  });

  it('cycles down from structures to zones', () => {
    useUiStore.getState().setActiveLayer('structures');
    cycleLayerDownAction.execute(ctx);
    expect(useUiStore.getState().activeLayer).toBe('zones');
  });

  it('cycles up from zones to structures', () => {
    useUiStore.getState().setActiveLayer('zones');
    cycleLayerUpAction.execute(ctx);
    expect(useUiStore.getState().activeLayer).toBe('structures');
  });

  it('skips hidden layers', () => {
    useUiStore.getState().setActiveLayer('structures');
    useUiStore.getState().setLayerVisible('zones', false);
    cycleLayerDownAction.execute(ctx);
    expect(useUiStore.getState().activeLayer).toBe('plantings');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/view/ src/actions/layers/`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement view and layer actions**

```ts
// src/actions/view/cycleViewMode.ts
import type { ActionDescriptor } from '../types';
import { useUiStore, type ViewMode } from '../../store/uiStore';

const MODES: ViewMode[] = ['select', 'draw', 'pan', 'zoom'];

export const cycleViewModeAction: ActionDescriptor = {
  id: 'view.cycleViewMode',
  label: 'Cycle View Mode',
  shortcut: { key: '`' },
  scope: 'canvas',
  targets: ['none'],
  transient: true,
  execute: () => {
    const current = useUiStore.getState().viewMode;
    const idx = MODES.indexOf(current);
    useUiStore.getState().setViewMode(MODES[(idx + 1) % MODES.length]);
  },
};
```

```ts
// src/actions/layers/cycleLayer.ts
import type { ActionDescriptor } from '../types';
import type { LayerId } from '../../model/types';
import { useUiStore } from '../../store/uiStore';

const LAYERS: LayerId[] = ['ground', 'blueprint', 'structures', 'zones', 'plantings'];

function cycleLayer(dir: 1 | -1): void {
  const { activeLayer, layerVisibility } = useUiStore.getState();
  const idx = LAYERS.indexOf(activeLayer);
  for (let step = 1; step < LAYERS.length; step++) {
    const next = (idx + dir * step + LAYERS.length) % LAYERS.length;
    if (layerVisibility[LAYERS[next]]) {
      useUiStore.getState().setActiveLayer(LAYERS[next]);
      return;
    }
  }
}

export const cycleLayerDownAction: ActionDescriptor = {
  id: 'layers.cycleDown',
  label: 'Next Layer',
  shortcut: { key: 'ArrowDown' },
  scope: 'canvas',
  targets: ['none'],
  transient: true,
  execute: () => cycleLayer(1),
};

export const cycleLayerUpAction: ActionDescriptor = {
  id: 'layers.cycleUp',
  label: 'Previous Layer',
  shortcut: { key: 'ArrowUp' },
  scope: 'canvas',
  targets: ['none'],
  transient: true,
  execute: () => cycleLayer(-1),
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/view/ src/actions/layers/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/view/ src/actions/layers/
git commit -m "feat(actions): implement view mode cycling and layer cycling actions"
```

---

### Task 6: Action Definitions — Objects (rotate + animate utility)

**Files:**
- Create: `src/actions/objects/animateRotation.ts`
- Create: `src/actions/objects/rotate.ts`
- Create: `src/actions/objects/duplicate.ts`
- Test: `src/actions/objects/objects.test.ts`

- [ ] **Step 1: Write tests**

```ts
// src/actions/objects/objects.test.ts
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { rotateCwAction, rotateCcwAction } from './rotate';
import { duplicateAction } from './duplicate';
import type { ActionContext } from '../types';

const ctx: ActionContext = { clipboard: { copy: () => {}, paste: () => {}, isEmpty: () => true }, target: { kind: 'selection' } };

describe('rotate actions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rotates a selected structure (swaps width/height after animation)', async () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 2 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    rotateCwAction.execute(ctx);

    // Advance past animation duration
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(20);
    }

    const s = useGardenStore.getState().garden.structures[0];
    expect(s.width).toBe(2);
    expect(s.height).toBe(4);
  });

  it('does not rotate circles', () => {
    useGardenStore.getState().addStructure({ type: 'pot', x: 0, y: 0, width: 2, height: 2 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    rotateCwAction.execute(ctx);

    const s = useGardenStore.getState().garden.structures[0];
    expect(s.width).toBe(2);
    expect(s.height).toBe(2);
  });
});

describe('duplicate action', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
  });

  it('duplicates selected structure with offset', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    duplicateAction.execute(ctx);

    const structures = useGardenStore.getState().garden.structures;
    expect(structures).toHaveLength(2);
    expect(structures[1].x).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/objects/objects.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement animateRotation utility**

```ts
// src/actions/objects/animateRotation.ts
import { useGardenStore } from '../../store/gardenStore';

const ROTATE_DURATION = 150;
const activeAnimations = new Map<string, number>();

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function animateRotation(
  id: string,
  layer: 'structures' | 'zones',
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
  finalRotation: number,
): void {
  const existing = activeAnimations.get(id);
  if (existing) cancelAnimationFrame(existing);

  const { updateStructure, updateZone } = useGardenStore.getState();
  const update = layer === 'structures' ? updateStructure : updateZone;
  const startTime = performance.now();

  function tick(now: number) {
    const rawT = Math.min((now - startTime) / ROTATE_DURATION, 1);
    const t = easeOut(rawT);
    const w = fromW + (toW - fromW) * t;
    const h = fromH + (toH - fromH) * t;
    update(id, { width: w, height: h });

    if (rawT < 1) {
      activeAnimations.set(id, requestAnimationFrame(tick));
    } else {
      activeAnimations.delete(id);
      const finalUpdate =
        layer === 'structures'
          ? { width: toW, height: toH, rotation: finalRotation }
          : { width: toW, height: toH };
      update(id, finalUpdate);
    }
  }

  activeAnimations.set(id, requestAnimationFrame(tick));
}
```

- [ ] **Step 4: Implement rotate and duplicate actions**

```ts
// src/actions/objects/rotate.ts
import type { ActionDescriptor } from '../types';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { animateRotation } from './animateRotation';

function rotate(ccw: boolean): void {
  const ids = useUiStore.getState().selectedIds;
  if (ids.length === 0) return;
  const { garden } = useGardenStore.getState();

  useGardenStore.getState().checkpoint();

  for (const id of ids) {
    const structure = garden.structures.find((s) => s.id === id);
    if (structure && structure.shape !== 'circle') {
      const newRotation = ccw
        ? (structure.rotation - 90 + 360) % 360
        : (structure.rotation + 90) % 360;
      animateRotation(
        id, 'structures',
        structure.width, structure.height,
        structure.height, structure.width,
        newRotation,
      );
      continue;
    }
    const zone = garden.zones.find((z) => z.id === id);
    if (zone) {
      animateRotation(id, 'zones', zone.width, zone.height, zone.height, zone.width, 0);
    }
  }
}

export const rotateCwAction: ActionDescriptor = {
  id: 'objects.rotateCw',
  label: 'Rotate Clockwise',
  shortcut: { key: 'r' },
  scope: 'canvas',
  targets: ['selection'],
  transient: true, // manages its own checkpoint
  canExecute: () => useUiStore.getState().selectedIds.length > 0,
  execute: () => rotate(false),
};

export const rotateCcwAction: ActionDescriptor = {
  id: 'objects.rotateCcw',
  label: 'Rotate Counter-Clockwise',
  shortcut: { key: 'R', shift: true },
  scope: 'canvas',
  targets: ['selection'],
  transient: true, // manages its own checkpoint
  canExecute: () => useUiStore.getState().selectedIds.length > 0,
  execute: () => rotate(true),
};
```

```ts
// src/actions/objects/duplicate.ts
import type { ActionDescriptor } from '../types';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';

export const duplicateAction: ActionDescriptor = {
  id: 'objects.duplicate',
  label: 'Duplicate',
  shortcut: { key: 'd', meta: true },
  scope: 'canvas',
  targets: ['selection'],
  canExecute: () => useUiStore.getState().selectedIds.length > 0,
  execute: () => {
    const ids = useUiStore.getState().selectedIds;
    const { garden, addStructure, addZone } = useGardenStore.getState();
    const cellSize = garden.gridCellSizeFt;

    const pastedIds: string[] = [];
    for (const id of ids) {
      const s = garden.structures.find((st) => st.id === id);
      if (s) {
        addStructure({ type: s.type, x: s.x + cellSize, y: s.y + cellSize, width: s.width, height: s.height });
        const newStructures = useGardenStore.getState().garden.structures;
        pastedIds.push(newStructures[newStructures.length - 1].id);
        continue;
      }
      const z = garden.zones.find((zn) => zn.id === id);
      if (z) {
        addZone({ x: z.x + cellSize, y: z.y + cellSize, width: z.width, height: z.height });
        const newZones = useGardenStore.getState().garden.zones;
        pastedIds.push(newZones[newZones.length - 1].id);
      }
    }

    if (pastedIds.length > 0) {
      useUiStore.getState().select(pastedIds[0]);
      for (let i = 1; i < pastedIds.length; i++) {
        useUiStore.getState().addToSelection(pastedIds[i]);
      }
    }
  },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/actions/objects/objects.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/actions/objects/
git commit -m "feat(actions): implement rotate, duplicate actions with animation utility"
```

---

### Task 7: Registry

**Files:**
- Create: `src/actions/registry.ts`

- [ ] **Step 1: Implement registry**

```ts
// src/actions/registry.ts
import type { ActionDescriptor } from './types';
import { undoAction } from './editing/undo';
import { redoAction } from './editing/redo';
import { deleteAction } from './editing/delete';
import { copyAction } from './editing/copy';
import { pasteAction } from './editing/paste';
import { selectAllAction } from './editing/selectAll';
import { cycleViewModeAction } from './view/cycleViewMode';
import { cycleLayerDownAction, cycleLayerUpAction } from './layers/cycleLayer';
import { rotateCwAction, rotateCcwAction } from './objects/rotate';
import { duplicateAction } from './objects/duplicate';

export const allActions: ActionDescriptor[] = [
  undoAction,
  redoAction,
  deleteAction,
  copyAction,
  pasteAction,
  selectAllAction,
  cycleViewModeAction,
  cycleLayerDownAction,
  cycleLayerUpAction,
  rotateCwAction,
  rotateCcwAction,
  duplicateAction,
];

export function getActionById(id: string): ActionDescriptor | undefined {
  return allActions.find((a) => a.id === id);
}

export function getActionsForScope(scopeId: string): ActionDescriptor[] {
  return allActions.filter((a) => a.scope === scopeId);
}

export function getActionsForTargetKind(kind: string): ActionDescriptor[] {
  return allActions.filter((a) => a.targets.includes(kind as any));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/registry.ts
git commit -m "feat(actions): create action registry combining all actions"
```

---

### Task 8: Keyboard Dispatch Hook

**Files:**
- Create: `src/actions/useKeyboardActionDispatch.ts`
- Test: `src/actions/useKeyboardActionDispatch.test.ts`

- [ ] **Step 1: Write integration test**

```ts
// src/actions/useKeyboardActionDispatch.test.ts
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';
import { useKeyboardActionDispatch } from './useKeyboardActionDispatch';

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
}

describe('useKeyboardActionDispatch', () => {
  const mockClipboard = { copy: vi.fn(), paste: vi.fn(), isEmpty: vi.fn(() => false) };

  beforeEach(() => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
    vi.clearAllMocks();
  });

  function setup() {
    return renderHook(() => useKeyboardActionDispatch({ clipboard: mockClipboard }));
  }

  it('dispatches undo on Cmd+Z', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);

    setup();
    fireKey('z', { metaKey: true });

    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
  });

  it('dispatches selectAll on Cmd+A', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    useGardenStore.getState().addStructure({ type: 'pot', x: 5, y: 5, width: 2, height: 2 });
    useUiStore.getState().setActiveLayer('structures');

    setup();
    fireKey('a', { metaKey: true });

    expect(useUiStore.getState().selectedIds).toHaveLength(2);
  });

  it('dispatches delete on Backspace when objects selected', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    setup();
    fireKey('Backspace');

    expect(useGardenStore.getState().garden.structures).toHaveLength(0);
  });

  it('does not dispatch canvas-scoped actions when input is focused', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    setup();
    fireKey('Backspace');

    // Should NOT delete because input is focused
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
    document.body.removeChild(input);
  });

  it('auto-checkpoints non-transient actions', () => {
    useGardenStore.getState().addStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, height: 4 });
    const id = useGardenStore.getState().garden.structures[0].id;
    useUiStore.getState().select(id);

    setup();
    fireKey('Backspace');

    // Should be able to undo the delete
    useGardenStore.getState().undo();
    expect(useGardenStore.getState().garden.structures).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/useKeyboardActionDispatch.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

```ts
// src/actions/useKeyboardActionDispatch.ts
import { useEffect } from 'react';
import type { ActionContext } from './types';
import { resolveAction, deriveKeyboardTarget } from './dispatch';
import { getActiveScopePath } from './scopes';
import { allActions } from './registry';
import { useGardenStore } from '../store/gardenStore';

export function useKeyboardActionDispatch(ctx: ActionContext) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activePath = getActiveScopePath();
      const action = resolveAction(e, activePath, allActions, ctx);
      if (!action) return;

      e.preventDefault();

      // Auto-checkpoint for non-transient actions
      if (!action.transient) {
        useGardenStore.getState().checkpoint();
      }

      const target = deriveKeyboardTarget(action);
      action.execute({ ...ctx, target });
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ctx]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/useKeyboardActionDispatch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/useKeyboardActionDispatch.ts src/actions/useKeyboardActionDispatch.test.ts
git commit -m "feat(actions): implement useKeyboardActionDispatch hook"
```

---

### Task 9: Migration — Replace Existing Keyboard Listeners

**Files:**
- Modify: `src/canvas/CanvasStack.tsx`
- Modify: `src/components/ViewToolbar.tsx`
- Modify: `src/components/LayerSelector.tsx`
- Delete: `src/canvas/hooks/useCanvasKeyboard.ts`
- Delete: `src/canvas/hooks/useCanvasKeyboard.test.ts`
- Modify: `src/canvas/hooks/useClipboard.ts` (extract for ActionContext)

- [ ] **Step 1: Mount useKeyboardActionDispatch in CanvasStack**

In `src/canvas/CanvasStack.tsx`:
- Add import: `import { useKeyboardActionDispatch } from '../actions/useKeyboardActionDispatch';`
- Remove import of `useCanvasKeyboard`
- Remove the `useCanvasKeyboard({ clipboard, cancelPlotting })` call
- Add after `const clipboard = useClipboard()`:
  ```ts
  useKeyboardActionDispatch({ clipboard });
  ```
- Keep the `cancelPlotting` logic — add an Escape action (or handle inline for now since Escape is tied to plot interaction state)

- [ ] **Step 2: Handle Escape separately**

Escape is special — it cancels plotting, which is local interaction state not suited to the action registry. Keep it as a minimal inline handler in CanvasStack:

```ts
useEffect(() => {
  function handleEscape(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      plot.cancel();
    }
  }
  window.addEventListener('keydown', handleEscape);
  return () => window.removeEventListener('keydown', handleEscape);
}, [plot]);
```

- [ ] **Step 3: Remove keyboard listener from ViewToolbar**

In `src/components/ViewToolbar.tsx`, remove the entire `useEffect` block that handles the backtick key (lines 84-100). The `cycleViewMode` action now handles this.

- [ ] **Step 4: Remove keyboard listener from LayerSelector**

In `src/components/LayerSelector.tsx`, remove the `useEffect` block that handles ArrowUp/ArrowDown (lines 347-369). The `cycleLayer` actions now handle this.

- [ ] **Step 5: Delete useCanvasKeyboard**

```bash
rm src/canvas/hooks/useCanvasKeyboard.ts
rm src/canvas/hooks/useCanvasKeyboard.test.ts
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (some old useCanvasKeyboard tests are gone; new action tests cover the same behavior)

- [ ] **Step 7: Run build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: migrate keyboard handling to action registry, remove scattered listeners"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Manual smoke test**

Verify in the browser:
- Cmd+Z / Cmd+Shift+Z — undo/redo works
- Cmd+A — selects all objects on active layer
- Cmd+C / Cmd+V — copy/paste works
- Delete/Backspace — deletes selected objects
- R / Shift+R — rotates selected objects (with animation)
- Backtick — cycles view mode
- Arrow Up/Down — cycles active layer
- Cmd+D — duplicates selected objects
- All of the above do NOT fire when typing in an input field

- [ ] **Step 2: Run full build and push**

```bash
npm run build && git push origin main
```
