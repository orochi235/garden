import cultivarData from '../data/cultivars.json';
import { resolveSeedStarting, type SeedStartingFields } from './floraSeedStarting';
import { getSpecies } from './species';

export type CultivarCategory = 'herbs' | 'vegetables' | 'greens' | 'fruits' | 'squash' | 'flowers' | 'root-vegetables' | 'legumes';

/** Raw cultivar entry as stored in JSON — only overrides are present. */
interface CultivarRaw {
  id: string;
  speciesId: string;
  variety: string | null;
  color?: string;
  footprintFt?: number;
  spacingFt?: number;
  heightFt?: number;
  /**
   * Cultivar-level mature-height override (feet). When set, takes precedence
   * over the species default for optimizer scoring (shading) and any other
   * consumer that wants the cultivar-specific value. Null/undefined means
   * fall back to the species `heightFt`.
   */
  heightFtOverride?: number;
  climber?: boolean;
  iconImage?: string;
  iconBgColor?: string;
  seedStarting?: Partial<SeedStartingFields>;
}

/** Resolved cultivar with all fields populated from species defaults. */
export interface Cultivar {
  id: string;
  speciesId: string;
  name: string;
  category: CultivarCategory;
  taxonomicName: string;
  variety: string | null;
  color: string;
  footprintFt: number;
  spacingFt: number;
  /** Mature height in feet. Undefined when neither cultivar nor species supplies a value. */
  heightFt: number | undefined;
  /**
   * Cultivar-level height override (feet), preserved from the raw entry so
   * downstream consumers (e.g. the optimizer adapter) can prefer it over the
   * species default. Undefined/absent means no override; use `heightFt` instead.
   */
  heightFtOverride?: number;
  climber: boolean;
  iconImage: string | null;
  iconBgColor: string | null;
  seedStarting: SeedStartingFields;
}

function resolveCultivar(raw: CultivarRaw): Cultivar {
  const species = getSpecies(raw.speciesId);
  if (!species) {
    throw new Error(`Unknown species "${raw.speciesId}" for cultivar "${raw.id}"`);
  }
  const name = raw.variety ? `${species.name}, ${raw.variety}` : species.name;
  return {
    id: raw.id,
    speciesId: raw.speciesId,
    name,
    category: species.category,
    taxonomicName: species.taxonomicName,
    variety: raw.variety,
    color: raw.color ?? species.color,
    footprintFt: raw.footprintFt ?? species.footprintFt,
    spacingFt: raw.spacingFt ?? species.spacingFt,
    heightFt: raw.heightFtOverride ?? raw.heightFt ?? species.heightFt,
    heightFtOverride: raw.heightFtOverride,
    climber: raw.climber ?? species.climber ?? false,
    iconImage: raw.iconImage ?? species.iconImage,
    iconBgColor: raw.iconBgColor ?? species.iconBgColor,
    seedStarting: resolveSeedStarting(species.seedStarting, raw.seedStarting),
  };
}

const cultivars: Cultivar[] = (cultivarData as CultivarRaw[]).map(resolveCultivar);
const cultivarMap = new Map<string, Cultivar>(cultivars.map((c) => [c.id, c]));

export function getCultivar(id: string): Cultivar | undefined {
  return cultivarMap.get(id);
}

export function getAllCultivars(): Cultivar[] {
  return cultivars;
}

// Re-export scheduling types so any future per-cultivar `seedStarting.actions`
// override has consistent typing.
export type { Constraint, Anchor, Offset, Unit, ActionDef } from './scheduler';
