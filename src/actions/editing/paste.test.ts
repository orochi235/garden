import { describe, expect, it, vi } from 'vitest';
import { pasteAction } from './paste';
import type { ActionContext } from '../types';

describe('pasteAction', () => {
  it('paste calls clipboard.paste', () => {
    const ctx: ActionContext = {
      clipboard: { copy: vi.fn(), paste: vi.fn(), isEmpty: vi.fn(() => false) },
    };
    pasteAction.execute(ctx);
    expect(ctx.clipboard.paste).toHaveBeenCalled();
  });
});
