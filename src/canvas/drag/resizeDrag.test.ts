import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createGarden, createStructure, createZone } from '../../model/types';
import { createResizeDrag, RESIZE_DRAG_KIND, type ResizePutative } from './resizeDrag';

describe('resizeDrag', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });
  afterEach(() => {
    useUiStore.getState().setDragPreview(null);
  });

  it('exposes the expected kind', () => {
    const drag = createResizeDrag();
    expect(drag.kind).toBe(RESIZE_DRAG_KIND);
  });

  it('compute returns null when no targetId is set', () => {
    const drag = createResizeDrag();
    expect(
      drag.compute({
        targetId: '',
        layer: 'structures',
        pose: { x: 0, y: 0, width: 0, length: 0 },
      }),
    ).toBeNull();
  });

  it('compute echoes the input as a putative when populated', () => {
    const drag = createResizeDrag();
    const putative = drag.compute({
      targetId: 's-1',
      layer: 'structures',
      pose: { x: 1, y: 2, width: 3, length: 4 },
    });
    expect(putative).toEqual({
      targetId: 's-1',
      layer: 'structures',
      pose: { x: 1, y: 2, width: 3, length: 4 },
    });
  });

  it('renderPreview draws a structure ghost at the projected bounds (rect)', () => {
    useGardenStore.getState().loadGarden(createGarden({ name: 'test', widthFt: 100, lengthFt: 100 }));
    const s = createStructure({ type: 'bed', x: 0, y: 0, width: 4, length: 4 });
    useGardenStore.setState((g) => ({ garden: { ...g.garden, structures: [s] } }));

    const drag = createResizeDrag();
    const calls: { fn: string; args: unknown[] }[] = [];
    const ctx = {
      save: () => calls.push({ fn: 'save', args: [] }),
      restore: () => calls.push({ fn: 'restore', args: [] }),
      fillRect: (...args: unknown[]) => calls.push({ fn: 'fillRect', args }),
      strokeRect: (...args: unknown[]) => calls.push({ fn: 'strokeRect', args }),
      beginPath: () => {},
      ellipse: () => {},
      fill: () => {},
      stroke: () => {},
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    const putative: ResizePutative = {
      targetId: s.id,
      layer: 'structures',
      pose: { x: 2, y: 3, width: 8, length: 6 },
    };
    drag.renderPreview(ctx, putative, { x: 0, y: 0, scale: 50 });

    const filled = calls.find((c) => c.fn === 'fillRect');
    const stroked = calls.find((c) => c.fn === 'strokeRect');
    expect(filled?.args).toEqual([2, 3, 8, 6]);
    expect(stroked?.args).toEqual([2, 3, 8, 6]);
  });

  it('renderPreview draws a zone ghost at the projected bounds', () => {
    useGardenStore.getState().loadGarden(createGarden({ name: 'test', widthFt: 100, lengthFt: 100 }));
    const z = createZone({ x: 0, y: 0, width: 4, length: 4, color: '#7FB069' });
    useGardenStore.setState((g) => ({ garden: { ...g.garden, zones: [z] } }));

    const drag = createResizeDrag();
    const calls: { fn: string; args: unknown[] }[] = [];
    const ctx = {
      save: () => calls.push({ fn: 'save', args: [] }),
      restore: () => calls.push({ fn: 'restore', args: [] }),
      fillRect: (...args: unknown[]) => calls.push({ fn: 'fillRect', args }),
      strokeRect: (...args: unknown[]) => calls.push({ fn: 'strokeRect', args }),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    const putative: ResizePutative = {
      targetId: z.id,
      layer: 'zones',
      pose: { x: 1, y: 1, width: 5, length: 5 },
    };
    drag.renderPreview(ctx, putative, { x: 0, y: 0, scale: 50 });

    const filled = calls.find((c) => c.fn === 'fillRect');
    const stroked = calls.find((c) => c.fn === 'strokeRect');
    expect(filled?.args).toEqual([1, 1, 5, 5]);
    expect(stroked?.args).toEqual([1, 1, 5, 5]);
  });

  it('renderPreview is a no-op when the targetId resolves to nothing', () => {
    const drag = createResizeDrag();
    const calls: string[] = [];
    const ctx = new Proxy({}, {
      get(_t, prop) {
        calls.push(String(prop));
        return () => {};
      },
    }) as unknown as CanvasRenderingContext2D;
    drag.renderPreview(
      ctx,
      {
        targetId: 'nonexistent',
        layer: 'structures',
        pose: { x: 0, y: 0, width: 1, length: 1 },
      },
      { x: 0, y: 0, scale: 50 },
    );
    // The structure-not-found branch returns before touching ctx.
    expect(calls).toEqual([]);
  });

  it('commit is a no-op (real commit lives in useResize.end)', () => {
    const drag = createResizeDrag();
    const before = useGardenStore.getState().garden;
    drag.commit({
      targetId: 'a',
      layer: 'structures',
      pose: { x: 0, y: 0, width: 1, length: 1 },
    });
    expect(useGardenStore.getState().garden).toBe(before);
  });
});
