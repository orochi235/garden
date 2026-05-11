/**
 * Scheduling engine — given plants + reference dates, produces a chronological
 * schedule of dated actions. Pure model; no React, no store imports.
 */

export type Unit = 'days' | 'weeks' | 'months';

export type Anchor =
  | { kind: 'target-transplant' }
  | { kind: 'last-frost' }
  | { kind: 'first-frost' }
  | { kind: 'absolute'; date: string }       // ISO 'YYYY-MM-DD'
  | { kind: 'today' }
  | { kind: 'action'; actionId: string };    // ref to another action in the same plant

export interface Offset {
  amount: number;                             // signed: positive = after, negative = before
  unit: Unit;
}

export interface Constraint {
  kind: 'lower' | 'upper' | 'exact';
  anchor: Anchor;
  offset?: Offset;
}

export interface ActionDef {
  id: string;
  label: string;
  constraints: Constraint[];
}

export interface ScheduleInputs {
  plants: Array<{
    id: string;
    cultivarId: string;
    label?: string;
    actions: ActionDef[];
  }>;
  targetTransplantDate: string;        // 'YYYY-MM-DD' — required
  lastFrostDate?: string;
  firstFrostDate?: string;
  today?: string;                      // defaults to current date
}

export interface ResolvedAction {
  plantId: string;
  cultivarId: string;
  actionId: string;
  label: string;
  earliest: string;                    // 'YYYY-MM-DD'
  latest: string;                      // == earliest when single-point
  conflicts: string[];                 // empty when ok
}

export interface Schedule {
  actions: ResolvedAction[];           // sorted by earliest, then by plantId
  warnings: string[];
}
