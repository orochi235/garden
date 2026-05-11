import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { PlantingLeafRow } from './PaletteItem';
import type { PaletteEntry } from './paletteData';
import { useUiStore } from '../../store/uiStore';

beforeAll(() => {
  // jsdom doesn't implement getContext. Stub a minimal 2D context so the
  // SmallPlantIcon paint effect doesn't blow up; we don't assert on rendering.
  const noop = () => {};
  const stub2d = {
    scale: noop, clearRect: noop, save: noop, restore: noop, translate: noop,
    fillRect: noop, beginPath: noop, arc: noop, fill: noop, stroke: noop,
    moveTo: noop, lineTo: noop, closePath: noop, drawImage: noop, fillText: noop,
    measureText: () => ({ width: 0 }),
    setTransform: noop, transform: noop, rotate: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    canvas: {} as unknown as HTMLCanvasElement,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '',
    globalAlpha: 1, globalCompositeOperation: 'source-over',
  };
  HTMLCanvasElement.prototype.getContext = function () {
    return stub2d as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement['getContext'];
});

const entry: PaletteEntry = {
  id: 'tomato',
  name: 'Tomato',
  category: 'plantings',
  speciesId: 'tomato',
  speciesName: 'Tomato',
  varietyLabel: 'Tomato',
  type: 'planting',
  defaultWidth: 0,
  defaultLength: 0,
  color: '#ff0000',
};

describe('PlantingLeafRow arming', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
  });

  it('does not arm when not in nursery mode', () => {
    useUiStore.getState().setAppMode('garden');
    const { container } = render(
      <PlantingLeafRow entry={entry} onDragBegin={() => {}} />,
    );
    fireEvent.click(container.firstChild as HTMLElement);
    expect(useUiStore.getState().armedCultivarId).toBeNull();
  });

  it('arms on click in nursery mode', () => {
    useUiStore.getState().setAppMode('nursery');
    const { container } = render(
      <PlantingLeafRow entry={entry} onDragBegin={() => {}} />,
    );
    fireEvent.click(container.firstChild as HTMLElement);
    expect(useUiStore.getState().armedCultivarId).toBe('tomato');
  });

  it('disarms when clicking the same armed entry again', () => {
    useUiStore.getState().setAppMode('nursery');
    useUiStore.getState().setArmedCultivarId('tomato');
    const { container } = render(
      <PlantingLeafRow entry={entry} onDragBegin={() => {}} />,
    );
    fireEvent.click(container.firstChild as HTMLElement);
    expect(useUiStore.getState().armedCultivarId).toBeNull();
  });

  it('switches arm to different cultivar', () => {
    useUiStore.getState().setAppMode('nursery');
    useUiStore.getState().setArmedCultivarId('basil');
    const { container } = render(
      <PlantingLeafRow entry={entry} onDragBegin={() => {}} />,
    );
    fireEvent.click(container.firstChild as HTMLElement);
    expect(useUiStore.getState().armedCultivarId).toBe('tomato');
  });
});
