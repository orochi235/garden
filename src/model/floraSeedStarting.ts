import type { CellSize } from './nursery';

/** Per-species/cultivar seed-starting metadata. All fields optional in storage. */
export interface SeedStartingFields {
  /** Whether this species/cultivar makes sense to start indoors from seed. */
  startable: boolean;
  /** Recommended cell size for starting. */
  cellSize: CellSize;
  /** Min/max germination days — scaffolding for future timeline feature. */
  daysToGerminate: [number, number] | null;
  /** Min/max weeks from sow until ready to transplant. */
  weeksToTransplant: [number, number] | null;
  /** Min/max weeks before the last frost date to start indoors. Negative = after last frost. */
  weeksBeforeLastFrost: [number, number] | null;
  /** Sow depth in inches. */
  sowDepthIn: number | null;
  /** Light requirement during germination. */
  lightOnGermination: 'light' | 'dark' | 'either' | null;
  /** Needs heat mat. */
  bottomHeat: boolean | null;
  /** Freeform notes. */
  notes: string | null;
}

export const DEFAULT_SEED_STARTING_FIELDS: SeedStartingFields = {
  startable: false,
  cellSize: 'medium',
  daysToGerminate: null,
  weeksToTransplant: null,
  weeksBeforeLastFrost: null,
  sowDepthIn: null,
  lightOnGermination: null,
  bottomHeat: null,
  notes: null,
};

/** Resolve effective seed-starting fields, merging cultivar over species defaults. */
export function resolveSeedStarting(
  speciesFields: Partial<SeedStartingFields> | undefined,
  cultivarFields: Partial<SeedStartingFields> | undefined,
): SeedStartingFields {
  return {
    ...DEFAULT_SEED_STARTING_FIELDS,
    ...(speciesFields ?? {}),
    ...(cultivarFields ?? {}),
  };
}
