import type { Garden } from '../../model/types';
import { getCultivar, type CultivarCategory } from '../../model/cultivars';
import type { ResolvedAction, Schedule } from '../../model/scheduler';

export interface PlantRow {
  id: string;
  kind: 'planting' | 'seedling';
  cultivarId: string;
  speciesId: string;
  parentId: string | null;
  name: string;
  variety: string | null;
  category: CultivarCategory | null;
  location: string;
  stage: 'planted' | 'seedling';
  spacingFt: number | undefined;
  heightFt: number | undefined;
  footprintFt: number | undefined;
  climber: boolean;
  iconImage: string | null;
  x: number | null;
  y: number | null;
  nextAction: { name: string; earliest: string } | null;
  allActions: ResolvedAction[];
}

function parentLabel(garden: Garden, parentId: string | null): string {
  if (!parentId) return '—';
  const struct = garden.structures.find((s) => s.id === parentId);
  if (struct) return struct.label || struct.type;
  const zone = garden.zones.find((z) => z.id === parentId);
  if (zone) return zone.label || 'zone';
  return '—';
}

function actionsForPlant(schedule: Pick<Schedule, 'actions'>, plantId: string): ResolvedAction[] {
  return schedule.actions.filter((a) => a.plantId === plantId);
}

function nextActionFor(actions: ResolvedAction[]): { name: string; earliest: string } | null {
  if (actions.length === 0) return null;
  // schedule.actions is pre-sorted by earliest; first match is the next action.
  const a = actions[0];
  return { name: a.label, earliest: a.earliest };
}

export function buildPlantRows(
  garden: Garden,
  schedule: Pick<Schedule, 'actions'>,
): PlantRow[] {
  const rows: PlantRow[] = [];

  for (const p of garden.plantings) {
    const cv = getCultivar(p.cultivarId);
    const actions = actionsForPlant(schedule, p.id);
    rows.push({
      id: p.id,
      kind: 'planting',
      cultivarId: p.cultivarId,
      speciesId: cv?.speciesId ?? '',
      parentId: p.parentId,
      name: cv?.name ?? p.cultivarId,
      variety: cv?.variety ?? null,
      category: cv?.category ?? null,
      location: parentLabel(garden, p.parentId),
      stage: 'planted',
      spacingFt: cv?.spacingFt,
      heightFt: cv?.heightFt,
      footprintFt: cv?.footprintFt,
      climber: cv?.climber ?? false,
      iconImage: cv?.iconImage ?? null,
      x: p.x,
      y: p.y,
      nextAction: nextActionFor(actions),
      allActions: actions,
    });
  }

  for (const s of garden.seedStarting.seedlings) {
    const cv = getCultivar(s.cultivarId);
    const actions = actionsForPlant(schedule, s.id);
    const tray = s.trayId ? garden.seedStarting.trays.find((t) => t.id === s.trayId) : null;
    rows.push({
      id: s.id,
      kind: 'seedling',
      cultivarId: s.cultivarId,
      speciesId: cv?.speciesId ?? '',
      parentId: s.trayId,
      name: cv?.name ?? s.cultivarId,
      variety: cv?.variety ?? null,
      category: cv?.category ?? null,
      location: tray?.label ?? '—',
      stage: 'seedling',
      spacingFt: cv?.spacingFt,
      heightFt: cv?.heightFt,
      footprintFt: cv?.footprintFt,
      climber: cv?.climber ?? false,
      iconImage: cv?.iconImage ?? null,
      x: null,
      y: null,
      nextAction: nextActionFor(actions),
      allActions: actions,
    });
  }

  return rows;
}
