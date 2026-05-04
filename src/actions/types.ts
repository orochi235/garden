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
  clipboard: { copy: () => void; cut: () => void; paste: () => void; isEmpty: () => boolean };
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
  /** When true, do not call preventDefault — allows the browser's native handling to fire too. */
  allowDefault?: boolean;
  execute: (ctx: ActionContext) => void;
  isValidTarget?: (target: ActionTarget, ctx: ActionContext) => boolean;
  canExecute?: (ctx: ActionContext) => boolean;
}

export interface ScopeNode {
  id: string;
  parent: string | null;
  active: () => boolean;
}
