import type { ResolvedAction } from '../../model/scheduler';

export interface DateGroup {
  date: string;
  actions: ResolvedAction[];
}

export interface PlantGroup {
  plantId: string;
  cultivarId: string;
  actions: ResolvedAction[];
}

/**
 * Group actions by their `earliest` date. Input is assumed already sorted
 * by the engine (earliest, then plantId).
 */
export function groupByDate(actions: ResolvedAction[]): DateGroup[] {
  const out: DateGroup[] = [];
  let current: DateGroup | null = null;
  for (const a of actions) {
    if (!current || current.date !== a.earliest) {
      current = { date: a.earliest, actions: [] };
      out.push(current);
    }
    current.actions.push(a);
  }
  return out;
}

/**
 * Group actions by plantId. Within each group, actions stay in their
 * original (chronological) order.
 */
export function groupByPlant(actions: ResolvedAction[]): PlantGroup[] {
  const byId = new Map<string, PlantGroup>();
  for (const a of actions) {
    let group = byId.get(a.plantId);
    if (!group) {
      group = { plantId: a.plantId, cultivarId: a.cultivarId, actions: [] };
      byId.set(a.plantId, group);
    }
    group.actions.push(a);
  }
  return [...byId.values()];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format an ISO date as "Mon D" (year omitted; the schedule UI carries year context). */
export function formatDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}`;
}

/** "Mon D" when earliest === latest, otherwise "Mon D – Mon D". */
export function formatWindow(earliest: string, latest: string): string {
  if (earliest === latest) return formatDate(earliest);
  return `${formatDate(earliest)} – ${formatDate(latest)}`;
}

/** Default target transplant date: today + 2 months, ISO yyyy-mm-dd. */
export function defaultTargetDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
