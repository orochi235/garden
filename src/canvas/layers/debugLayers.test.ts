import { describe, it, expect } from 'vitest';
import { createDebugLayers } from './debugLayers';
import { createGarden } from '../../model/types';

// vi.mock('../debug') is provided in vitest.setup or inline:
import { vi } from 'vitest';

vi.mock('../debug', () => ({
  isDebugEnabled: (token: string) => ['hitboxes', 'axes'].includes(token),
}));

describe('createDebugLayers', () => {
  it('only includes layers whose token is enabled', () => {
    const g = createGarden({ name: 't', widthFt: 10, lengthFt: 10 });
    const layers = createDebugLayers('garden', () => g);
    const ids = layers.map((l) => l.id);
    expect(ids).toContain('debug-hitboxes');
    expect(ids).toContain('debug-axes');
    expect(ids).not.toContain('debug-bounds');
    expect(ids).not.toContain('debug-grid');
  });
});
