import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent, fireEvent, render } from '@testing-library/react';
import { FloatingTraySwitcher } from './FloatingTraySwitcher';
import { instantiatePreset } from '../model/trayCatalog';
import { useGardenStore, blankGarden } from '../store/gardenStore';

vi.mock('../actions/view/resetView', () => ({
  zoomToTray: vi.fn(),
}));

function fireDragOver(el: Element, clientY: number) {
  const event = createEvent.dragOver(el);
  Object.defineProperty(event, 'clientY', { value: clientY });
  Object.defineProperty(event, 'dataTransfer', { value: makeDT() });
  fireEvent(el, event);
}

function makeDT() {
  return {
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: () => {},
    getData: () => '',
    types: [] as string[],
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    clearData: () => {},
    setDragImage: () => {},
  } as unknown as DataTransfer;
}

function seedThreeTrays() {
  const a = { ...instantiatePreset('1020-36')!, id: 'tray-a', label: 'A' };
  const b = { ...instantiatePreset('1020-36')!, id: 'tray-b', label: 'B' };
  const c = { ...instantiatePreset('1020-36')!, id: 'tray-c', label: 'C' };
  useGardenStore.getState().addTray(a);
  useGardenStore.getState().addTray(b);
  useGardenStore.getState().addTray(c);
}

describe('FloatingTraySwitcher drag-to-reorder', () => {
  beforeEach(() => {
    useGardenStore.getState().reset();
    useGardenStore.getState().loadGarden(blankGarden());
  });

  it('reorders trays via dragStart -> dragOver -> drop', () => {
    seedThreeTrays();
    const { container } = render(<FloatingTraySwitcher />);
    const rows = container.querySelectorAll<HTMLElement>('[data-tray-id]');
    expect(rows).toHaveLength(3);

    const source = rows[0]; // A
    const target = rows[2]; // C

    fireEvent.dragStart(source, { dataTransfer: makeDT() });

    // Drop in lower half of C => insertion slot 3 (end). Mock getBoundingClientRect.
    target.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    fireDragOver(target, 18);
    fireEvent.drop(target, { dataTransfer: makeDT() });

    const ids = useGardenStore.getState().garden.nursery.trays.map((t) => t.id);
    expect(ids).toEqual(['tray-b', 'tray-c', 'tray-a']);
  });

  it('drop in upper half of target inserts before that target', () => {
    seedThreeTrays();
    const { container } = render(<FloatingTraySwitcher />);
    const rows = container.querySelectorAll<HTMLElement>('[data-tray-id]');
    const source = rows[2]; // C
    const target = rows[0]; // A

    fireEvent.dragStart(source, { dataTransfer: makeDT() });
    target.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    console.log('rect:', target.getBoundingClientRect());
    fireDragOver(target, 2);
    fireEvent.drop(target, { dataTransfer: makeDT() });

    const ids = useGardenStore.getState().garden.nursery.trays.map((t) => t.id);
    expect(ids).toEqual(['tray-c', 'tray-a', 'tray-b']);
  });

  it('dragEnd clears drag state without mutating the store', () => {
    seedThreeTrays();
    const { container } = render(<FloatingTraySwitcher />);
    const rows = container.querySelectorAll<HTMLElement>('[data-tray-id]');
    const before = useGardenStore.getState().garden.nursery.trays;

    fireEvent.dragStart(rows[0], { dataTransfer: makeDT() });
    fireEvent.dragEnd(rows[0]);

    expect(useGardenStore.getState().garden.nursery.trays).toBe(before);
  });

  it('drop at the same slot is a no-op', () => {
    seedThreeTrays();
    const { container } = render(<FloatingTraySwitcher />);
    const rows = container.querySelectorAll<HTMLElement>('[data-tray-id]');
    const source = rows[1]; // B
    const before = useGardenStore.getState().garden.nursery.trays;

    fireEvent.dragStart(source, { dataTransfer: makeDT() });
    source.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireDragOver(source, 2);
    fireEvent.drop(source, { dataTransfer: makeDT() });

    expect(useGardenStore.getState().garden.nursery.trays.map((t) => t.id)).toEqual(
      before.map((t) => t.id),
    );
  });
});
