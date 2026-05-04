import type { ActionDescriptor } from '../types';

export const cutAction: ActionDescriptor = {
  id: 'editing.cut',
  label: 'Cut',
  shortcut: { key: 'x', meta: true },
  scope: 'canvas',
  targets: ['selection'],
  transient: true,
  execute: (ctx) => { ctx.clipboard.cut(); },
};
