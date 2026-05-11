import { type CellSize, createTray, type Tray } from './nursery';

export interface TrayPreset {
  id: string;
  label: string;
  rows: number;
  cols: number;
  cellSize: CellSize;
  /** Override the cell pitch implied by cellSize (inches). */
  cellPitchIn?: number;
  /** Outer footprint width in inches. */
  widthIn?: number;
  /** Outer footprint height in inches. */
  heightIn?: number;
}

// Standard 1020 trays are ~10" × 20" footprint, in landscape orientation.
// Cell pitches reflect typical inserts: 72-cell ≈ 1.5", 36-cell ≈ 2.2", 18-cell ≈ 3.25".
export const TRAY_CATALOG: TrayPreset[] = [
  { id: '1020-72', label: '1020 Tray, 72-cell', rows: 6, cols: 12, cellSize: 'small',
    cellPitchIn: 1.5, widthIn: 20, heightIn: 10 },
  { id: '1020-36', label: '1020 Tray, 36-cell', rows: 4, cols: 9, cellSize: 'medium',
    cellPitchIn: 2.2, widthIn: 20, heightIn: 10 },
  { id: '1020-18', label: '1020 Tray, 18-cell', rows: 3, cols: 6, cellSize: 'large',
    cellPitchIn: 3.25, widthIn: 20, heightIn: 10 },
  { id: 'soilblock-2in', label: 'Soil Blocks, 2"', rows: 4, cols: 5, cellSize: 'large',
    cellPitchIn: 2.0, widthIn: 10, heightIn: 8 },
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
    cellPitchIn: preset.cellPitchIn,
    widthIn: preset.widthIn,
    heightIn: preset.heightIn,
    label: label ?? preset.label,
  });
}
