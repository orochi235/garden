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
    const ctx = { clipboard: { copy: () => {}, cut: () => {}, paste: () => {}, isEmpty: () => true } };

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
    const ctx = { clipboard: { copy: () => {}, cut: () => {}, paste: () => {}, isEmpty: () => true } };

    const result = resolveAction(event, activePath, [structuresDelete, canvasDelete], ctx);
    expect(result?.id).toBe('editing.delete');
  });

  it('returns null when no action matches', () => {
    const event = new KeyboardEvent('keydown', { key: 'q' });
    const activePath = ['canvas', 'global'];
    const ctx = { clipboard: { copy: () => {}, cut: () => {}, paste: () => {}, isEmpty: () => true } };

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
