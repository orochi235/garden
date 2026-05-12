import { describe, expect, it } from 'vitest';
import type { Cultivar } from '../../../model/cultivars';
import type { ResolvedAction } from '../../../model/scheduler';
import { barColor } from './barColors';

function mkAction(p: Partial<ResolvedAction> = {}): ResolvedAction {
  return {
    plantId: 'p1', cultivarId: 'tomato.brandywine',
    actionId: 'sow', label: 'Sow indoors',
    earliest: '2026-05-01', latest: '2026-05-01', conflicts: [],
    ...p,
  };
}

function mkCultivar(color: string | undefined): Cultivar {
  return { id: 'c', name: 'Test', color: color ?? '', iconBgColor: null } as unknown as Cultivar;
}

describe('barColor', () => {
  it('by-action returns distinct colors for known action ids', () => {
    const sow = barColor('by-action', { action: mkAction({ actionId: 'sow' }), cultivar: null, today: '2026-05-01' });
    const trans = barColor('by-action', { action: mkAction({ actionId: 'transplant' }), cultivar: null, today: '2026-05-01' });
    const harv = barColor('by-action', { action: mkAction({ actionId: 'harvest' }), cultivar: null, today: '2026-05-01' });
    expect(sow.bg).not.toBe(trans.bg);
    expect(trans.bg).not.toBe(harv.bg);
  });

  it('by-action falls back to neutral for unknown action ids', () => {
    const out = barColor('by-action', { action: mkAction({ actionId: 'unknown-future-action' }), cultivar: null, today: '2026-05-01' });
    expect(out.bg).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('by-plant uses the cultivar palette color when available', () => {
    const out = barColor('by-plant', { action: mkAction(), cultivar: mkCultivar('#b35d5d'), today: '2026-05-01' });
    expect(out.bg).toBe('#b35d5d');
  });

  it('by-plant falls back to neutral when cultivar is null or colorless', () => {
    const a = barColor('by-plant', { action: mkAction(), cultivar: null, today: '2026-05-01' });
    const b = barColor('by-plant', { action: mkAction(), cultivar: mkCultivar(undefined), today: '2026-05-01' });
    expect(a.bg).toBe(b.bg);
  });

  it('by-plant picks light/dark fg based on luminance', () => {
    const light = barColor('by-plant', { action: mkAction(), cultivar: mkCultivar('#ffffff'), today: '2026-05-01' });
    const dark = barColor('by-plant', { action: mkAction(), cultivar: mkCultivar('#000000'), today: '2026-05-01' });
    expect(light.fg).toBe('#1a1a1a');
    expect(dark.fg).toBe('#ffffff');
  });

  it('by-urgency: overdue', () => {
    const out = barColor('by-urgency', { action: mkAction({ earliest: '2026-04-01', latest: '2026-04-10' }), cultivar: null, today: '2026-05-01' });
    expect(out.bg).toBe('#c54a4a');
  });

  it('by-urgency: today-in-window', () => {
    const out = barColor('by-urgency', { action: mkAction({ earliest: '2026-04-25', latest: '2026-05-05' }), cultivar: null, today: '2026-05-01' });
    expect(out.bg).toBe('#c5a44e');
  });

  it('by-urgency: future', () => {
    const out = barColor('by-urgency', { action: mkAction({ earliest: '2026-06-01', latest: '2026-06-10' }), cultivar: null, today: '2026-05-01' });
    expect(out.bg).toBe('#4a4a4a');
  });

  it('mono returns a single color regardless of inputs', () => {
    const a = barColor('mono', { action: mkAction({ actionId: 'sow' }), cultivar: null, today: '2026-05-01' });
    const b = barColor('mono', { action: mkAction({ actionId: 'harvest' }), cultivar: mkCultivar('#b35d5d'), today: '2026-05-01' });
    expect(a.bg).toBe(b.bg);
  });

  it('unknown encoding falls back to mono', () => {
    const out = barColor('what' as never, { action: mkAction(), cultivar: null, today: '2026-05-01' });
    expect(out.bg).toBe('#4A7C59');
  });
});
