import { describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../types';
import { cutAction } from './cut';

describe('cutAction', () => {
  it('cut calls clipboard.cut', () => {
    const ctx: ActionContext = {
      clipboard: { copy: vi.fn(), cut: vi.fn(), paste: vi.fn(), isEmpty: vi.fn(() => false) },
    };
    cutAction.execute(ctx);
    expect(ctx.clipboard.cut).toHaveBeenCalled();
  });
});
