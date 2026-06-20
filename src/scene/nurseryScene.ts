import type { AddNodeSpec, Scene } from '@orochi235/weasel';
import { asNodeId, createScene } from '@orochi235/weasel';
import { trayWorldOrigin } from '../canvas/adapters/nurseryLayout';
import { cellCenterInches } from '../canvas/nurseryHitTest';
import type { NurseryState, Seedling, Tray } from '../model/nursery';

export type NurseryLayer = 'trays' | 'seedlings';

/** Render order, low→high: tray bodies under seedlings. */
export const NURSERY_LAYERS: readonly NurseryLayer[] = ['trays', 'seedlings'];

/** Matches GARDEN_HISTORY_LIMIT. */
export const NURSERY_HISTORY_LIMIT = 100;

/** Translation + size. Trays carry outer dims; seedlings carry cell pitch.
 *  Tray poses are world (auto-flow origin); seedling poses are parent-LOCAL
 *  (cell center within the tray). Both are PROJECTIONS of authoritative
 *  cell/index data, recomputed every reconcile — never the source of truth. */
export interface NurseryPose {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type NurseryNodeData =
  | { kind: 'tray'; order: number; tray: Tray }
  | { kind: 'seedling'; seedling: Seedling };

export type NurseryScene = Scene<NurseryNodeData, NurseryLayer, NurseryPose>;
export type NurseryAddNodeSpec = AddNodeSpec<NurseryNodeData, NurseryLayer, NurseryPose>;

/** The non-spatial remainder of a NurseryState — seedlings the scene does NOT
 *  own (transplanted-out: trayId/row/col all null, history-only, not rendered). */
export interface NurseryBase {
  transplanted: Seedling[];
}

export function createNurseryScene(initial: readonly NurseryAddNodeSpec[]): NurseryScene {
  return createScene<NurseryNodeData, NurseryLayer, NurseryPose>({
    systemLayers: NURSERY_LAYERS.map((id) => ({ id })),
    initial,
    historyLimit: NURSERY_HISTORY_LIMIT,
  });
}

/** A seedling lives in the scene iff it occupies a tray cell. */
function isInTray(s: Seedling): boolean {
  return s.trayId != null && s.row != null && s.col != null;
}

export function nurseryToScene(ns: NurseryState): NurseryAddNodeSpec[] {
  const specs: NurseryAddNodeSpec[] = [];
  const trayById = new Map(ns.trays.map((t) => [t.id, t]));

  ns.trays.forEach((tray, order) => {
    const o = trayWorldOrigin(tray, ns);
    specs.push({
      id: asNodeId(tray.id),
      kind: 'container',
      layer: 'trays',
      pose: { x: o.x, y: o.y, width: tray.widthIn, height: tray.heightIn },
      parent: null,
      data: { kind: 'tray', order, tray },
    });
  });

  for (const s of ns.seedlings) {
    if (!isInTray(s)) continue;
    const tray = trayById.get(s.trayId as string);
    if (!tray) continue; // dangling trayId — drop from scene; guard upstream.
    const c = cellCenterInches(tray, s.row as number, s.col as number);
    specs.push({
      id: asNodeId(s.id),
      kind: 'leaf',
      layer: 'seedlings',
      pose: { x: c.x, y: c.y, width: tray.cellPitchIn, height: tray.cellPitchIn },
      parent: asNodeId(s.trayId as string),
      data: { kind: 'seedling', seedling: s },
    });
  }

  return specs;
}

/** Split a NurseryState into the scene-bound part (returned by sceneToNursery)
 *  and the non-spatial base (transplanted-out seedlings). */
export function splitNurseryBase(ns: NurseryState): NurseryBase {
  return { transplanted: ns.seedlings.filter((s) => !isInTray(s)) };
}

/** Compose a NurseryState from a live scene + base. Trays sorted by `order`;
 *  seedlings = in-tray (from scene) + transplanted-out (from base). Authority
 *  is read from node `data`, not poses (poses are derived projections). */
export function sceneToNursery(scene: NurseryScene, base: NurseryBase): NurseryState {
  const trays: { order: number; tray: Tray }[] = [];
  const seedlings: Seedling[] = [];
  for (const [, node] of scene.nodes) {
    if (node.data.kind === 'tray') trays.push({ order: node.data.order, tray: node.data.tray });
    else seedlings.push(node.data.seedling);
  }
  trays.sort((a, b) => a.order - b.order);
  return {
    trays: trays.map((t) => t.tray),
    seedlings: [...seedlings, ...base.transplanted],
  };
}
