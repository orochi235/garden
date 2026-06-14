import { copyAction } from './editing/copy';
import { cutAction } from './editing/cut';
import { cycleSelectionNextAction, cycleSelectionPrevAction } from './editing/cycleSelection';
import { deleteAction } from './editing/delete';
import { pasteAction } from './editing/paste';
import { redoAction } from './editing/redo';
import { selectAllAction } from './editing/selectAll';
import { undoAction } from './editing/undo';
import { cycleLayerDownAction, cycleLayerUpAction } from './layers/cycleLayer';
import { duplicateAction } from './objects/duplicate';
import { rotateCcwAction, rotateCwAction } from './objects/rotate';
import type { ActionDescriptor } from './types';
import { cycleViewModeAction } from './view/cycleViewMode';
import { resetViewAction } from './view/resetView';

export const allActions: ActionDescriptor[] = [
  undoAction,
  redoAction,
  deleteAction,
  copyAction,
  cutAction,
  pasteAction,
  selectAllAction,
  cycleSelectionNextAction,
  cycleSelectionPrevAction,
  cycleViewModeAction,
  resetViewAction,
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
