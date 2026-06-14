import { describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../types';
import { pasteAction } from './paste';

describe('pasteAction', () => {
  it('paste calls clipboard.paste', () => {
    const ctx: ActionContext = {
      clipboard: { copy: vi.fn(), cut: vi.fn(), paste: vi.fn(), isEmpty: vi.fn(() => false) },
    };
    pasteAction.execute(ctx);
    expect(ctx.clipboard.paste).toHaveBeenCalled();
  });

  it('is transient (clipboard hook owns the history checkpoint)', () => {
    expect(pasteAction.transient).toBe(true);
  });
});
