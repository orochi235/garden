import type { ActionDescriptor } from './types';
import { undoAction } from './editing/undo';
import { redoAction } from './editing/redo';
import { deleteAction } from './editing/delete';
import { copyAction } from './editing/copy';
import { cutAction } from './editing/cut';
import { pasteAction } from './editing/paste';
import { selectAllAction } from './editing/selectAll';
import { cycleSelectionNextAction, cycleSelectionPrevAction } from './editing/cycleSelection';
import { cycleViewModeAction } from './view/cycleViewMode';
import { resetViewAction } from './view/resetView';
import { cycleLayerDownAction, cycleLayerUpAction } from './layers/cycleLayer';
import { rotateCwAction, rotateCcwAction } from './objects/rotate';
import { duplicateAction } from './objects/duplicate';

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
