import type { ActionContext, ActionDescriptor, ActionTarget, Shortcut } from './types';

export function matchShortcut(event: KeyboardEvent, shortcut: Shortcut): boolean {
  if (event.key !== shortcut.key) return false;
  if (!!shortcut.meta !== (event.metaKey || event.ctrlKey)) return false;
  if (!!shortcut.shift !== event.shiftKey) return false;
  if (!!shortcut.alt !== event.altKey) return false;
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
  const matching = actions.filter((a) => a.shortcut && matchesAnyShortcut(event, a.shortcut));
  if (matching.length === 0) return null;

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
    return { kind: 'layer', layer: '' };
  }
  return { kind: 'none' };
}
