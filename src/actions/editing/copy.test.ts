import { describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../types';
import { copyAction } from './copy';

describe('copyAction', () => {
  it('copy calls clipboard.copy', () => {
    const ctx: ActionContext = {
      clipboard: { copy: vi.fn(), cut: vi.fn(), paste: vi.fn(), isEmpty: vi.fn(() => false) },
    };
    copyAction.execute(ctx);
    expect(ctx.clipboard.copy).toHaveBeenCalled();
  });
});
