import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankGarden, useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import {
  createAreaSelectDrag,
  AREA_SELECT_DRAG_KIND,
  type AreaSelectPutative,
} from './areaSelectDrag';


describe('areaSelectDrag', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
    useUiStore.getState().reset();
  });
  afterEach(() => {
    useUiStore.getState().setDragPreview(null);
  });

  it('exposes the expected kind constant', () => {
    const drag = createAreaSelectDrag();
    expect(drag.kind).toBe(AREA_SELECT_DRAG_KIND);
    expect(AREA_SELECT_DRAG_KIND).toBe('eric-area-select');
  });

  it('compute returns null for a zero-extent (start === current) input', () => {
    const drag = createAreaSelectDrag();
    expect(
      drag.compute({
        start: { x: 5, y: 5 },
        current: { x: 5, y: 5 },
        shiftHeld: false,
      }),
    ).toBeNull();
  });

  it('compute echoes a populated input into a putative', () => {
    const drag = createAreaSelectDrag();
    const out = drag.compute({
      start: { x: 1, y: 2 },
      current: { x: 7, y: 9 },
      shiftHeld: true,
    });
    expect(out).toEqual({
      start: { x: 1, y: 2 },
      current: { x: 7, y: 9 },
      shiftHeld: true,
    });
  });

  it('renderPreview returns two DrawCommands (fill + stroke) for a non-degenerate rect', () => {
    const drag = createAreaSelectDrag();
    const putative: AreaSelectPutative = {
      start: { x: 2, y: 3 },
      current: { x: 12, y: 8 },
      shiftHeld: false,
    };
    const cmds = drag.renderPreview(putative, { x: 0, y: 0, scale: 50 });
    expect(cmds).toHaveLength(2);
    expect(cmds[0].kind).toBe('path');
    expect(cmds[1].kind).toBe('path');
  });

  it('renderPreview returns [] for a zero-area rect (degenerate width or height)', () => {
    const drag = createAreaSelectDrag();
    const cmds = drag.renderPreview(
      { start: { x: 5, y: 5 }, current: { x: 5, y: 12 }, shiftHeld: false },
      { x: 0, y: 0, scale: 50 },
    );
    expect(cmds).toHaveLength(0);
  });

  it('commit is a no-op (selection commit lives in useAreaSelect.end)', () => {
    const drag = createAreaSelectDrag();
    const beforeGarden = useGardenStore.getState().garden;
    const beforeSel = useUiStore.getState().selectedIds;
    drag.commit({
      start: { x: 0, y: 0 },
      current: { x: 5, y: 5 },
      shiftHeld: false,
    });
    expect(useGardenStore.getState().garden).toBe(beforeGarden);
    expect(useUiStore.getState().selectedIds).toBe(beforeSel);
  });

  it('read returns a default-shaped input (controller-unused)', () => {
    const drag = createAreaSelectDrag();
    const out = drag.read(
      { clientX: 0, clientY: 0, modifiers: { shift: false, alt: false, ctrl: false, meta: false } },
      { container: document.createElement('div'), view: { x: 0, y: 0, scale: 1 } },
    );
    expect(out).toEqual({
      start: { x: 0, y: 0 },
      current: { x: 0, y: 0 },
      shiftHeld: false,
    });
  });
});
