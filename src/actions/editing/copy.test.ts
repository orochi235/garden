import { describe, expect, it, vi } from 'vitest';
import { copyAction } from './copy';
import type { ActionContext } from '../types';

describe('copyAction', () => {
  it('copy calls clipboard.copy', () => {
    const ctx: ActionContext = {
      clipboard: { copy: vi.fn(), paste: vi.fn(), isEmpty: vi.fn(() => false) },
    };
    copyAction.execute(ctx);
    expect(ctx.clipboard.copy).toHaveBeenCalled();
  });
});
