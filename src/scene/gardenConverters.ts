import {
  asNodeId,
  composeRectPose,
  decomposeRectPose,
  type SerializedNode,
} from '@orochi235/weasel';
import { getCultivar } from '../model/cultivars';
import type { Garden, Planting, Structure, Zone } from '../model/types';
import type {
  GardenAddNodeSpec,
  GardenBase,
  GardenLayer,
  GardenNodeData,
  GardenPose,
  GardenScene,
  GardenSerializedScene,
} from './gardenScene';
import { CLIP_NONE_KEY, clipNone, GARDEN_LAYERS } from './gardenScene';

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
  // A structure must be a Weasel 'container' node if it has any child structures or
  // plantings, even when its own `container` field is false (e.g. a patio that holds pots).
  const structChildIds = new Set(
    garden.structures.filter((s) => s.parentId).map((s) => s.parentId as string),
  );
  const plantingParentIds = new Set(garden.plantings.map((p) => p.parentId));
  const isSceneContainer = (s: Structure) =>
    s.container || structChildIds.has(s.id) || plantingParentIds.has(s.id);
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
      kind: isSceneContainer(s) ? 'container' : 'leaf',
      layer: 'structures',
      pose: parent ? decomposeRectPose(structurePose(parent), structurePose(s)) : structurePose(s),
      parent: s.parentId ? asNodeId(s.parentId) : null,
      // A NESTED container (e.g. a pot inside a patio) has a parent-LOCAL scene
      // pose, but eric's scene-slot painter renders in WORLD space. The kit's
      // default container clip is built from that local pose, so it would clip
      // the world-space body out entirely. Disable the clip for nested
      // containers — their contents stay clipped by the top-level ancestor.
      // Top-level containers keep the kit default (their pose IS world).
      ...(isSceneContainer(s) && parent ? { clipFromPose: clipNone } : {}),
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
      pose: parent ? decomposeRectPose(zonePose(parent), zonePose(z)) : zonePose(z),
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
  // They render in the dedicated top `plantings` layer (above every container
  // body), even though they remain scene CHILDREN of their container for
  // hit-testing / move / reparent. The kit's layer-major render order + the
  // per-node-layer scene-slot painter honor a child's own layer, and the scene
  // allows a child on a higher layer than its parent. (We still validate the
  // parentId resolves, to catch malformed gardens.) No zIndex → array order.
  const zoneIds = new Set(garden.zones.map((z) => z.id));
  for (const p of garden.plantings) {
    if (!zoneIds.has(p.parentId) && !structById.has(p.parentId)) {
      throw new Error(`gardenToScene: planting '${p.id}' has unknown parentId '${p.parentId}'`);
    }
    specs.push({
      id: asNodeId(p.id),
      kind: 'leaf',
      layer: 'plantings',
      pose: plantingPose(p),
      parent: asNodeId(p.parentId),
      data: { kind: 'planting', cultivarId: p.cultivarId, label: p.label, icon: p.icon },
    });
  }

  return specs;
}

/**
 * Serialize a Garden directly to a `SerializedScene` (the shape `scene.toJSON()`
 * emits and `scene.loadState()` consumes). Reuses `gardenToScene` for all
 * frame/footprint/container/layer logic, then maps the resulting specs to
 * serialized nodes. Spec order is parent-before-child, which `loadState`
 * requires. Backs both snapshot-undo restore and (Phase 5) `.garden` persistence.
 */
export function gardenToSerializedScene(garden: Garden): GardenSerializedScene {
  const specs = gardenToScene(garden);
  const nodes: SerializedNode<GardenNodeData, GardenLayer, GardenPose>[] = specs.map((s) => {
    const node: SerializedNode<GardenNodeData, GardenLayer, GardenPose> = {
      id: s.id!,
      kind: s.kind,
      layer: s.layer,
      pose: s.pose,
      data: s.data,
    };
    if (s.parent != null) node.parent = s.parent;
    // clipFromPose is a function (can't serialize) — emit its registry key so
    // loadState resolves it back. Only `clipNone` (nested containers) is used.
    if (s.kind === 'container' && s.clipFromPose === clipNone) {
      node.clipFromPoseKey = CLIP_NONE_KEY;
    }
    return node;
  });
  return { version: 1, systemLayers: GARDEN_LAYERS.map((id) => ({ id })), nodes };
}

export function splitBase(garden: Garden): GardenBase {
  const { structures: _s, zones: _z, plantings: _p, ...base } = garden;
  return base;
}

// Output array order follows scene.nodes insertion order (not zIndex); tests compare by id/sort.
export function sceneToGarden(scene: GardenScene, base: GardenBase): Garden {
  const structures: Structure[] = [];
  const zones: Zone[] = [];
  const plantings: Planting[] = [];

  // Structures/zones are stored parent-local in the Scene (kit frame); the Garden
  // stores them in world coords. Compose world up the parent chain, memoized.
  // Recursion needs no cycle guard: the Scene constructor rejects parent cycles,
  // so any GardenScene reaching here has a structurally acyclic parent chain.
  const worldCache = new Map<string, GardenPose>();
  function worldPoseOf(nodeId: string): GardenPose {
    const hit = worldCache.get(nodeId);
    if (hit) return hit;
    const n = scene.get(asNodeId(nodeId))!;
    const local = n.pose;
    const world = n.parent ? composeRectPose(worldPoseOf(String(n.parent)), local) : local;
    worldCache.set(nodeId, world);
    return world;
  }

  for (const [, node] of scene.nodes) {
    const data = node.data;
    const pose = node.pose;
    const parentId = node.parent ? String(node.parent) : null;

    if (data.kind === 'structure') {
      const world = worldPoseOf(String(node.id));
      structures.push({
        id: String(node.id),
        type: data.type,
        shape: world.shape ?? 'rectangle',
        x: world.x,
        y: world.y,
        width: world.width,
        length: world.height,
        rotation: world.rotation ?? 0,
        color: data.color,
        label: data.label,
        zIndex: data.zIndex,
        parentId,
        groupId: data.groupId,
        snapToGrid: data.snapToGrid,
        surface: data.surface,
        container: data.container,
        fill: data.fill,
        layout: data.layout,
        wallThicknessFt: data.wallThicknessFt,
        clipChildren: data.clipChildren,
      });
    } else if (data.kind === 'zone') {
      const world = worldPoseOf(String(node.id));
      zones.push({
        id: String(node.id),
        x: world.x,
        y: world.y,
        width: world.width,
        length: world.height,
        color: data.color,
        label: data.label,
        zIndex: data.zIndex,
        parentId,
        soilType: data.soilType,
        sunExposure: data.sunExposure,
        layout: data.layout,
        pattern: data.pattern,
      });
    } else if (data.kind === 'planting') {
      if (!node.parent)
        throw new Error(`sceneToGarden: planting '${String(node.id)}' has no parent`);
      plantings.push({
        id: String(node.id),
        parentId: String(node.parent),
        cultivarId: data.cultivarId,
        x: pose.x,
        y: pose.y,
        label: data.label,
        icon: data.icon,
      });
    }
  }

  return { ...base, structures, zones, plantings };
}
