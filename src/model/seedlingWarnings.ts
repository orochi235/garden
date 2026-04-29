import type { Seedling, Tray } from './seedStarting';
import { getCultivar } from './cultivars';

export type SeedlingWarningKind = 'wrong-cell-size';

export interface SeedlingWarning {
  kind: SeedlingWarningKind;
  message: string;
}

/** Color used for warning highlights on seedlings (goldenrod). */
export const SEEDLING_WARNING_COLOR = '#daa520';

/** Returns warnings for a seedling given the tray it sits in. Empty array = no issues. */
export function getSeedlingWarnings(seedling: Seedling, tray: Tray): SeedlingWarning[] {
  const out: SeedlingWarning[] = [];
  const cultivar = getCultivar(seedling.cultivarId);
  if (!cultivar) return out;
  const preferred = cultivar.seedStarting.cellSize;
  if (preferred !== tray.cellSize) {
    out.push({
      kind: 'wrong-cell-size',
      message: `Prefers ${preferred} cells; tray uses ${tray.cellSize}.`,
    });
  }
  return out;
}

export function hasSeedlingWarnings(seedling: Seedling, tray: Tray): boolean {
  return getSeedlingWarnings(seedling, tray).length > 0;
}
