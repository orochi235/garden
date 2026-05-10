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

  it('renderPreview emits DrawCommands for a structure ghost (rect)', () => {
    useGardenStore.getState().loadGarden(createGarden({ name: 'test', widthFt: 100, lengthFt: 100 }));
    const s = createStructure({ type: 'bed', x: 0, y: 0, width: 4, length: 4 });
    useGardenStore.setState((g) => ({ garden: { ...g.garden, structures: [s] } }));

    const drag = createResizeDrag();
    const putative: ResizePutative = {
      targetId: s.id,
      layer: 'structures',
      pose: { x: 2, y: 3, width: 8, length: 6 },
    };
    const cmds = drag.renderPreview(putative, { x: 0, y: 0, scale: 50 });
    expect(cmds).toHaveLength(1);
    expect(cmds[0].kind).toBe('group');
  });

  it('renderPreview emits DrawCommands for a zone ghost', () => {
    useGardenStore.getState().loadGarden(createGarden({ name: 'test', widthFt: 100, lengthFt: 100 }));
    const z = createZone({ x: 0, y: 0, width: 4, length: 4, color: '#7FB069' });
    useGardenStore.setState((g) => ({ garden: { ...g.garden, zones: [z] } }));

    const drag = createResizeDrag();
    const putative: ResizePutative = {
      targetId: z.id,
      layer: 'zones',
      pose: { x: 1, y: 1, width: 5, length: 5 },
    };
    const cmds = drag.renderPreview(putative, { x: 0, y: 0, scale: 50 });
    expect(cmds).toHaveLength(1);
    expect(cmds[0].kind).toBe('group');
  });

  it('renderPreview returns [] when the targetId resolves to nothing', () => {
    const drag = createResizeDrag();
    const cmds = drag.renderPreview(
      {
        targetId: 'nonexistent',
        layer: 'structures',
        pose: { x: 0, y: 0, width: 1, length: 1 },
      },
      { x: 0, y: 0, scale: 50 },
    );
    expect(cmds).toEqual([]);
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
