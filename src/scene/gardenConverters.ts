import { asNodeId } from '@orochi235/weasel';
import { getCultivar } from '../model/cultivars';
import type { Garden, Planting, Structure, Zone } from '../model/types';
import type { GardenAddNodeSpec } from './gardenScene';

const DEFAULT_FOOTPRINT_FT = 0.5;

export function structurePose(s: Structure) {
  return { x: s.x, y: s.y, width: s.width, height: s.length, rotation: s.rotation, shape: s.shape };
}

export function zonePose(z: Zone) {
  return { x: z.x, y: z.y, width: z.width, height: z.length };
}

export function plantingPose(p: Planting) {
  const fp = getCultivar(p.cultivarId)?.footprintFt ?? DEFAULT_FOOTPRINT_FT;
  return { x: p.x, y: p.y, width: fp, height: fp };
}

export function gardenToScene(garden: Garden): GardenAddNodeSpec[] {
  const specs: GardenAddNodeSpec[] = [];
  const byZ = <T extends { zIndex: number }>(a: T, b: T) => a.zIndex - b.zIndex;

  // Structures — parents must be emitted before children; siblings in ascending zIndex.
  const structById = new Map(garden.structures.map((s) => [s.id, s]));
  const emittedStruct = new Set<string>();
  const visitingStruct = new Set<string>();
  const emitStruct = (s: Structure) => {
    if (emittedStruct.has(s.id)) return;
    if (visitingStruct.has(s.id))
      throw new Error(`gardenToScene: cycle in structure parentId at '${s.id}'`);
    visitingStruct.add(s.id);
    const parent = s.parentId ? structById.get(s.parentId) : undefined;
    if (parent) emitStruct(parent);
    specs.push({
      id: asNodeId(s.id),
      kind: s.container ? 'container' : 'leaf',
      layer: 'structures',
      pose: structurePose(s),
      parent: s.parentId ? asNodeId(s.parentId) : null,
      data: {
        kind: 'structure',
        type: s.type,
        color: s.color,
        label: s.label,
        zIndex: s.zIndex,
        groupId: s.groupId,
        snapToGrid: s.snapToGrid,
        surface: s.surface,
        container: s.container,
        fill: s.fill,
        layout: s.layout,
        wallThicknessFt: s.wallThicknessFt,
        clipChildren: s.clipChildren,
      },
    });
    emittedStruct.add(s.id);
    visitingStruct.delete(s.id);
  };
  for (const s of [...garden.structures].sort(byZ)) emitStruct(s);

  // Zones (containers) — same parent-before-child guarantee; siblings in ascending zIndex.
  const zoneById = new Map(garden.zones.map((z) => [z.id, z]));
  const emittedZone = new Set<string>();
  const visitingZone = new Set<string>();
  const emitZone = (z: Zone) => {
    if (emittedZone.has(z.id)) return;
    if (visitingZone.has(z.id))
      throw new Error(`gardenToScene: cycle in zone parentId at '${z.id}'`);
    visitingZone.add(z.id);
    const parent = z.parentId ? zoneById.get(z.parentId) : undefined;
    if (parent) emitZone(parent);
    specs.push({
      id: asNodeId(z.id),
      kind: 'container',
      layer: 'zones',
      pose: zonePose(z),
      parent: z.parentId ? asNodeId(z.parentId) : null,
      data: {
        kind: 'zone',
        color: z.color,
        label: z.label,
        zIndex: z.zIndex,
        soilType: z.soilType,
        sunExposure: z.sunExposure,
        layout: z.layout,
        pattern: z.pattern,
      },
    });
    emittedZone.add(z.id);
    visitingZone.delete(z.id);
  };
  for (const z of [...garden.zones].sort(byZ)) emitZone(z);

  // Plantings (leaves) — always have a parentId; parent already emitted above.
  // Weasel requires a child to be on the same layer as its parent, so we derive
  // the layer from whether the parent is a structure or zone.
  // Plantings have no zIndex and are therefore emitted in array order (no sort).
  const zoneIds = new Set(garden.zones.map((z) => z.id));
  for (const p of garden.plantings) {
    let layer: 'zones' | 'structures';
    if (zoneIds.has(p.parentId)) {
      layer = 'zones';
    } else if (structById.has(p.parentId)) {
      layer = 'structures';
    } else {
      throw new Error(`gardenToScene: planting '${p.id}' has unknown parentId '${p.parentId}'`);
    }
    specs.push({
      id: asNodeId(p.id),
      kind: 'leaf',
      layer,
      pose: plantingPose(p),
      parent: asNodeId(p.parentId),
      data: { kind: 'planting', cultivarId: p.cultivarId, label: p.label, icon: p.icon },
    });
  }

  return specs;
}
