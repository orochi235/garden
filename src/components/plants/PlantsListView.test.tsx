import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getAllCultivars } from '../../model/cultivars';
import { createPlanting, createStructure } from '../../model/types';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { PlantsListView } from './PlantsListView';

function seedGarden() {
  useGardenStore.getState().reset();
  useUiStore.getState().reset();
  const garden = useGardenStore.getState().garden;
  const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
  bed.label = 'Bed A';
  const cv = getAllCultivars()[0];
  const planting = createPlanting({ parentId: bed.id, x: 1, y: 1, cultivarId: cv.id });
  useGardenStore.setState({
    garden: { ...garden, structures: [bed], plantings: [planting] },
  });
  return { bed, planting, cv };
}

describe('PlantsListView', () => {
  it('renders a row for each planting with the default columns', () => {
    const { cv } = seedGarden();
    render(<PlantsListView />);
    expect(screen.getByRole('columnheader', { name: /name/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /location/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /stage/i })).toBeDefined();
    const row = screen.getByRole('row', { name: new RegExp(cv.name, 'i') });
    expect(within(row).getByText('Bed A')).toBeDefined();
    expect(within(row).getByText(/planted/i)).toBeDefined();
  });

  it('renders empty state when the garden has no plants', () => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
    render(<PlantsListView />);
    expect(screen.getByText(/no plants in this garden/i)).toBeDefined();
  });
});
