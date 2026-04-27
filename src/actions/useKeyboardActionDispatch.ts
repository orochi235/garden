import { useEffect } from 'react';
import type { ActionContext } from './types';
import { resolveAction, deriveKeyboardTarget } from './dispatch';
import { getActiveScopePath } from './scopes';
import { allActions } from './registry';
import { useGardenStore } from '../store/gardenStore';

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
