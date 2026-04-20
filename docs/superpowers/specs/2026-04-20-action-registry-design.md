# Action Registry Design

## Purpose

A centralized system for defining, discovering, and dispatching actions across the app. Actions are the single abstraction for anything the user can "do" — triggered by keyboard shortcuts, context menus, toolbar buttons, or a future command palette. The registry eliminates scattered keyboard listeners and gives every trigger surface a uniform way to query what's available and invoke it.

## Action Descriptor

```ts
interface ActionDescriptor {
  id: string;                                   // unique, e.g. 'editing.delete'
  label: string;                                // human-readable, for UI surfaces
  icon?: string;                                // future: icon identifier for UI surfaces
  shortcut?: Shortcut | Shortcut[];             // keybinding(s), optional
  scope: string;                                // scope id from the tree
  targets: ActionTarget['kind'][];              // what target kinds this action accepts
  transient?: boolean;                          // if true, skip undo checkpoint
  execute: (ctx: ActionContext) => void;
  isValidTarget?: (target: ActionTarget, ctx: ActionContext) => boolean;
  canExecute?: (ctx: ActionContext) => boolean;
}

interface Shortcut {
  key: string;        // KeyboardEvent.key value
  meta?: boolean;     // Cmd on Mac
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

type ActionTarget =
  | { kind: 'selection' }                     // whatever's currently selected
  | { kind: 'objects'; ids: string[] }        // specific objects (e.g. right-clicked)
  | { kind: 'layer'; layer: string }          // a layer
  | { kind: 'none' }                          // global actions (undo, zoom)

interface ActionContext {
  clipboard: { copy: () => void; paste: () => void; isEmpty: () => boolean };
  target?: ActionTarget;
}
```

## Evaluation Order

When dispatching an action (any trigger surface):

1. Shortcut/trigger matches
2. Scope is on the active path
3. Target kind is in `targets`
4. `isValidTarget(target, ctx)` returns true (if defined)
5. `canExecute(ctx)` returns true (if defined)
6. `execute(ctx)`

Context menus use steps 3 + 4 to build the visible item list, then step 5 to determine enabled/disabled state.

## Scope Tree

Scopes form a tree. Dispatch walks from the deepest active scope upward toward `global`. First matching action wins. If `canExecute` or `isValidTarget` rejects, bubbling continues.

### Registry

```ts
const SCOPES = {
  global:     { parent: null },
  canvas:     { parent: 'global' },
  structures: { parent: 'canvas' },
  zones:      { parent: 'canvas' },
  plantings:  { parent: 'canvas' },
  sidebar:    { parent: 'global' },
  properties: { parent: 'sidebar' },
} as const;
```

### Activation

Each scope's active state is derived from existing UI state — no new state introduced:

- `global` — always active
- `canvas` — document.activeElement is not an input/select
- `structures` / `zones` / `plantings` — canvas active + activeLayer matches
- `sidebar` — always active (it's always mounted)
- `properties` — selection is non-empty

### Resolution

`getActiveScopePath()` returns the deepest-to-shallowest list of active scopes. E.g. when the structures layer is active and no input is focused: `['structures', 'canvas', 'global']`.

## Undo Integration

The dispatch system handles undo checkpointing automatically. Before calling `execute()`, the dispatcher checks the `transient` flag:

- **`transient: false` (default)** — dispatcher calls `gardenStore.checkpoint()` before `execute()`. The action doesn't need to manage undo state.
- **`transient: true`** — no checkpoint. Used for actions that don't mutate garden state (undo, redo, cycleViewMode, cycleLayer, zoom, pan) or that manage their own checkpointing for batch operations.

This means most actions that mutate state get undo for free with zero boilerplate.

## Actions Are Stateless Dispatchers

Actions do not own state. They call into stores (`useGardenStore.getState()`, `useUiStore.getState()`) and utilities. Stateful concerns like clipboard and animation live outside the action system:

- **Clipboard** is passed via `ActionContext`
- **Rotation animation** lives in a standalone `animateRotation()` utility with module-scoped animation state

## File Structure

```
src/actions/
  types.ts                    — ActionDescriptor, Shortcut, ActionTarget, ActionContext, ScopeDefinition
  scopes.ts                   — scope tree registry + getActiveScopePath()
  registry.ts                 — combines all actions, provides lookup helpers
  dispatch.ts                 — matchShortcut(), resolveAction()
  useKeyboardActionDispatch.ts — single hook mounted at app root
  editing/
    undo.ts
    redo.ts
    delete.ts
    copy.ts
    paste.ts
    selectAll.ts
  view/
    cycleViewMode.ts
    zoomIn.ts
    zoomOut.ts
  layers/
    cycleLayer.ts
    toggleLayerVisibility.ts
  objects/
    rotate.ts
    duplicate.ts
```

Each action file exports a single `ActionDescriptor`. The registry imports and combines them into one flat array.

## Keyboard Dispatch Hook

```ts
// Mounted once at App root (or CanvasStack)
function useKeyboardActionDispatch(ctx: ActionContext) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activePath = getActiveScopePath();
      const action = resolveAction(e, activePath, ctx);
      if (action) {
        e.preventDefault();
        action.execute({ ...ctx, target: deriveKeyboardTarget(action) });
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ctx]);
}
```

Keyboard dispatch derives the target from the action's `targets` declaration:
- If the action accepts `'selection'`, target is `{ kind: 'selection' }`
- If the action only accepts `'none'`, target is `{ kind: 'none' }`

## Migration

The following existing keyboard listeners are replaced:

| Current location | Actions absorbed |
|---|---|
| `useCanvasKeyboard` | undo, redo, copy, paste, delete, rotate, escape |
| `ViewToolbar` useEffect | cycleViewMode |
| `LayerSelector` useEffect | cycleLayer |

Components keep their UI (buttons, visual state) but lose their `addEventListener('keydown', ...)` blocks.

## Testing Strategy

- **Action unit tests:** Call `execute()` with a constructed context, assert store mutations
- **Scope resolution tests:** Given a UI state, assert `getActiveScopePath()` returns the expected path
- **Dispatch tests:** Given a keyboard event + active path, assert the correct action is selected (or none)
- **Integration:** Verify the full flow from keydown → action execution for key actions

## Future Trigger Surfaces

Other dispatch hooks follow the same pattern:
- `useContextMenuActionDispatch` — filters by `targets: ['objects']`, provides clicked object as target
- Command palette — shows all actions, resolves target at invocation time
- Toolbar buttons — invoke actions directly by id
