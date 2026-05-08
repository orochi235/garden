import { describe, it, expect, vi } from 'vitest';
import { createDebugLayers } from './debugLayers';
import { createGarden } from '../../model/types';

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

  it('hitbox layer enumerates structure + zone bboxes in garden mode', () => {
    const g = createGarden({ name: 't', widthFt: 10, lengthFt: 10 });
    g.structures.push({
      id: 's1', type: 'pot', shape: 'circle', x: 1, y: 2, width: 3, length: 4,
      rotation: 0, color: '#fff', label: 's1', zIndex: 0, parentId: null,
      groupId: null, snapToGrid: true, surface: false, container: true,
      fill: null, layout: null, wallThicknessFt: 0.1,
      clipChildren: true,
    });
    g.zones.push({
      id: 'z1', x: 0, y: 0, width: 5, length: 5, color: '#0f0', label: 'z1',
      zIndex: 0, parentId: null, soilType: null, sunExposure: null,
      layout: null, pattern: null,
    });
    const layers = createDebugLayers('garden', () => g);
    const hitbox = layers.find((l) => l.id === 'debug-hitboxes');
    expect(hitbox).toBeTruthy();
    expect(hitbox!.alwaysOn).toBe(true);
    // Smoke: invoke draw with a stub ctx — should not throw.
    const calls: string[] = [];
    const ctx = {
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect ${x} ${y} ${w} ${h}`),
      get globalAlpha() { return 0; },
      set globalAlpha(_v: number) {},
      get strokeStyle() { return ''; },
      set strokeStyle(_v: string) {},
      get lineWidth() { return 0; },
      set lineWidth(_v: number) {},
    } as unknown as CanvasRenderingContext2D;
    hitbox!.draw(ctx, undefined, { x: 0, y: 0, scale: 1 });
    expect(calls.filter((c) => c.startsWith('strokeRect')).length).toBe(2);
  });
});
