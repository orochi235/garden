import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('sorts rows by Location when its header is clicked, toggling direction', async () => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
    const garden = useGardenStore.getState().garden;
    const aBed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    aBed.label = 'Aaa Bed';
    const zBed = createStructure({ type: 'raised-bed', x: 5, y: 5, width: 4, length: 4 });
    zBed.label = 'Zzz Bed';
    const cv = getAllCultivars()[0];
    // Insert Zzz first so insertion order does NOT match asc sort.
    const pZ = createPlanting({ parentId: zBed.id, x: 0, y: 0, cultivarId: cv.id });
    const pA = createPlanting({ parentId: aBed.id, x: 0, y: 0, cultivarId: cv.id });
    useGardenStore.setState({
      garden: { ...garden, structures: [aBed, zBed], plantings: [pZ, pA] },
    });
    const user = userEvent.setup();
    render(<PlantsListView />);

    const locations = () =>
      screen.getAllByRole('row').slice(1).map((tr) => {
        const cells = within(tr).getAllByRole('cell');
        // Locate the Location cell by index: Icon(0) Name(1) Variety(2) Category(3) Location(4) …
        return cells[4].textContent;
      });

    // Insertion order initially: Zzz Bed, Aaa Bed (no sort applied yet — default sort is by name, ties)
    // After first click on Location: asc — Aaa Bed first.
    await user.click(screen.getByRole('columnheader', { name: /location/i }));
    expect(locations()).toEqual(['Aaa Bed', 'Zzz Bed']);
    // Second click: desc.
    await user.click(screen.getByRole('columnheader', { name: /location/i }));
    expect(locations()).toEqual(['Zzz Bed', 'Aaa Bed']);
  });

  it('filters rows by text search across name/variety/location', async () => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
    const garden = useGardenStore.getState().garden;
    const bed1 = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    bed1.label = 'North Bed';
    const bed2 = createStructure({ type: 'raised-bed', x: 5, y: 5, width: 4, length: 4 });
    bed2.label = 'South Bed';
    const cv = getAllCultivars()[0];
    const p1 = createPlanting({ parentId: bed1.id, x: 0, y: 0, cultivarId: cv.id });
    const p2 = createPlanting({ parentId: bed2.id, x: 0, y: 0, cultivarId: cv.id });
    useGardenStore.setState({
      garden: { ...garden, structures: [bed1, bed2], plantings: [p1, p2] },
    });
    const user = userEvent.setup();
    render(<PlantsListView />);
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2
    await user.type(screen.getByPlaceholderText(/search/i), 'south');
    expect(screen.getAllByRole('row')).toHaveLength(2); // header + 1
    expect(screen.getByText('South Bed')).toBeDefined();
  });

  it('filters by stage chip', async () => {
    useGardenStore.getState().reset();
    useUiStore.getState().reset();
    const garden = useGardenStore.getState().garden;
    const bed = createStructure({ type: 'raised-bed', x: 0, y: 0, width: 4, length: 4 });
    bed.label = 'Bed';
    const cv = getAllCultivars()[0];
    const planting = createPlanting({ parentId: bed.id, x: 0, y: 0, cultivarId: cv.id });
    useGardenStore.setState({
      garden: {
        ...garden,
        structures: [bed],
        plantings: [planting],
        seedStarting: {
          trays: [{
            id: 't', label: 'Tray', rows: 1, cols: 1,
            cellSize: 'medium', cellPitchIn: 1.5, widthIn: 5, heightIn: 5,
            slots: [{ state: 'sown', seedlingId: 's' }],
          }],
          seedlings: [{ id: 's', cultivarId: cv.id, trayId: 't', row: 0, col: 0, labelOverride: null }],
        },
      },
    });
    const user = userEvent.setup();
    render(<PlantsListView />);
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + planting + seedling
    await user.click(screen.getByRole('button', { name: /^plantings$/i }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /^seedlings$/i }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /^all$/i }));
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });
});
