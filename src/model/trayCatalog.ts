import { type CellSize, createTray, type Tray } from './seedStarting';

export interface TrayPreset {
  id: string;
  label: string;
  rows: number;
  cols: number;
  cellSize: CellSize;
}

export const TRAY_CATALOG: TrayPreset[] = [
  { id: '1020-72', label: '1020 Tray, 72-cell', rows: 8, cols: 9, cellSize: 'small' },
  { id: '1020-36', label: '1020 Tray, 36-cell', rows: 6, cols: 6, cellSize: 'medium' },
  { id: '1020-18', label: '1020 Tray, 18-cell', rows: 3, cols: 6, cellSize: 'large' },
  { id: 'soilblock-2in', label: 'Soil Blocks, 2"', rows: 5, cols: 4, cellSize: 'large' },
];

export function getTrayPreset(id: string): TrayPreset | undefined {
  return TRAY_CATALOG.find((p) => p.id === id);
}

export function instantiatePreset(id: string, label?: string): Tray | undefined {
  const preset = getTrayPreset(id);
  if (!preset) return undefined;
  return createTray({
    rows: preset.rows,
    cols: preset.cols,
    cellSize: preset.cellSize,
    label: label ?? preset.label,
  });
}
