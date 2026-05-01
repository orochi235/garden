import type { ActionDescriptor } from '../types';

export const pasteAction: ActionDescriptor = {
  id: 'editing.paste',
  label: 'Paste',
  shortcut: { key: 'v', meta: true },
  scope: 'canvas',
  targets: ['none'],
  transient: true,
  canExecute: (ctx) => !ctx.clipboard.isEmpty(),
  execute: (ctx) => { ctx.clipboard.paste(); },
};
