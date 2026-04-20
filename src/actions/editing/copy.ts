import type { ActionDescriptor } from '../types';

export const copyAction: ActionDescriptor = {
  id: 'editing.copy',
  label: 'Copy',
  shortcut: { key: 'c', meta: true },
  scope: 'canvas',
  targets: ['selection'],
  transient: true,
  execute: (ctx) => { ctx.clipboard.copy(); },
};
