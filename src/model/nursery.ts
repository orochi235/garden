import { generateId } from './types';

export type CellSize = 'small' | 'medium' | 'large';
export type CellState = 'empty' | 'sown' | 'transplanted';

export interface TraySlot {
  state: CellState;
  /** Reference to the seedling occupying this slot (when state !== 'empty'). */
  seedlingId: string | null;
}

export interface Tray {
  id: string;
  label: string;
  rows: number;
  cols: number;
  /** Cell pitch in inches (the inner cell size). */
  cellSize: CellSize;
  /** Inches between cell centers (computed from cellSize but stored for custom trays). */
  cellPitchIn: number;
  /** Outer tray dimensions in inches. */
  widthIn: number;
  heightIn: number;
  /** Row-major: slots[row * cols + col]. */
  slots: TraySlot[];
}

export interface Seedling {
  id: string;
  cultivarId: string;
  /** Where this seedling currently lives. Null if transplanted-out (history only). */
  trayId: string | null;
  /** Cell address within `trayId` (null if not in a tray). */
  row: number | null;
  col: number | null;
  /** Optional user-set override for the cell label. */
  labelOverride: string | null;
}

export interface NurseryState {
  trays: Tray[];
  seedlings: Seedling[];
}

export const CELL_PITCH_IN: Record<CellSize, number> = {
  small: 1.1,
  medium: 1.5,
  large: 2.0,
};

/** Fixed padding between the outer tray edge and the cell grid, on every side. */
export const TRAY_PADDING_IN = 0.35;

function emptySlot(): TraySlot {
  return { state: 'empty', seedlingId: null };
}

export function createTray(opts: {
  rows: number;
  cols: number;
  cellSize: CellSize;
  label: string;
  cellPitchIn?: number;
  /** Outer tray width in inches. Defaults to cols * cellPitchIn. */
  widthIn?: number;
  /** Outer tray height in inches. Defaults to rows * cellPitchIn. */
  heightIn?: number;
}): Tray {
  const nominalPitch = opts.cellPitchIn ?? CELL_PITCH_IN[opts.cellSize];
  const widthIn = opts.widthIn ?? opts.cols * nominalPitch + 2 * TRAY_PADDING_IN;
  const heightIn = opts.heightIn ?? opts.rows * nominalPitch + 2 * TRAY_PADDING_IN;
  // Subdivide the interior (after fixed padding) evenly; cells stay square via min().
  const pitch = Math.min(
    (widthIn - 2 * TRAY_PADDING_IN) / opts.cols,
    (heightIn - 2 * TRAY_PADDING_IN) / opts.rows,
  );
  const slots = Array.from({ length: opts.rows * opts.cols }, emptySlot);
  return {
    id: generateId(),
    label: opts.label,
    rows: opts.rows,
    cols: opts.cols,
    cellSize: opts.cellSize,
    cellPitchIn: pitch,
    widthIn,
    heightIn,
    slots,
  };
}

/** Inches of slack between the outer tray edge and the cell grid on each side. */
export function trayInteriorOffsetIn(tray: Tray): { x: number; y: number } {
  return {
    x: Math.max(0, (tray.widthIn - tray.cols * tray.cellPitchIn) / 2),
    y: Math.max(0, (tray.heightIn - tray.rows * tray.cellPitchIn) / 2),
  };
}

export function createSeedling(opts: {
  cultivarId: string;
  trayId?: string | null;
  row?: number | null;
  col?: number | null;
}): Seedling {
  return {
    id: generateId(),
    cultivarId: opts.cultivarId,
    trayId: opts.trayId ?? null,
    row: opts.row ?? null,
    col: opts.col ?? null,
    labelOverride: null,
  };
}

export function emptyNurseryState(): NurseryState {
  return { trays: [], seedlings: [] };
}

export function getCell(tray: Tray, row: number, col: number): TraySlot | undefined {
  if (row < 0 || row >= tray.rows || col < 0 || col >= tray.cols) return undefined;
  return tray.slots[row * tray.cols + col];
}

export function setCell(tray: Tray, row: number, col: number, slot: TraySlot): Tray {
  if (row < 0 || row >= tray.rows || col < 0 || col >= tray.cols) return tray;
  const idx = row * tray.cols + col;
  const slots = tray.slots.slice();
  slots[idx] = slot;
  return { ...tray, slots };
}
