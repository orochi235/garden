import { useEffect } from 'react';
import { useGardenStore } from '../store/gardenStore';
import { deriveKeyboardTarget, resolveAction } from './dispatch';
import { allActions } from './registry';
import { getActiveScopePath } from './scopes';
import type { ActionContext } from './types';

export function useKeyboardActionDispatch(ctx: ActionContext) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activePath = getActiveScopePath();
      const action = resolveAction(e, activePath, allActions, ctx);
      if (!action) return;

      if (!action.allowDefault) e.preventDefault();

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
