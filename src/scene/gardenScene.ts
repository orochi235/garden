import type {
  AddNodeSpec,
  CanDropIntoDep,
  PoseComposition,
  SavedScene,
  Scene,
  SerializedScene,
} from '@weasel-js/core';
import { asNodeId, createScene, RECT_POSE_COMPOSITION } from '@weasel-js/core';
import type { Layout } from '../model/layout';
import type { FillType, Garden, LayerId, StructureShape } from '../model/types';

export type GardenLayer = LayerId;

/** Render order, low→high. Matches the old eric layer stack (`baseList`):
 *  zones (ground regions) under structures (beds/pots/paths) under plantings.
 *  Plantings are emitted into the dedicated `plantings` layer (drawn last, on
 *  top of every container body) — the kit scene slot honors each node's own
 *  layer, so a planting that is a scene child of a container still draws here. */
export const GARDEN_LAYERS: readonly GardenLayer[] = [
  'ground',
  'blueprint',
  'zones',
  'structures',
  'plantings',
];

/** Matches today's MAX_HISTORY in src/store/history.ts. */
export const GARDEN_HISTORY_LIMIT = 100;

/**
 * Rect pose for every garden node. We adopt RectPose field names ({x,y,width,height})
 * so kit move/resize/compose helpers work unmodified; eric's `length` is translated to
 * `height` at the .garden boundary (see gardenConverters). `rotation`/`shape` ride along
 * as opaque extra fields (the kit preserves unknown pose keys).
 */
export interface GardenPose {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  shape?: StructureShape;
}

/** Domain payload minus geometry. `kind` is eric's discriminator, distinct from the Scene
 * node's structural kind ('mark' | 'group'). */
export type GardenNodeData =
  | {
      kind: 'structure';
      type: string;
      color: string;
      label: string;
      zIndex: number;
      groupId: string | null;
      snapToGrid: boolean;
      surface: boolean;
      container: boolean;
      fill: FillType | null;
      layout: Layout | null;
      wallThicknessFt: number;
      clipChildren: boolean;
    }
  | {
      kind: 'zone';
      color: string;
      label: string;
      zIndex: number;
      soilType: string | null;
      sunExposure: string | null;
      layout: Layout | null;
      pattern: string | null;
    }
  | { kind: 'planting'; cultivarId: string; label: string; icon: string | null };

export type GardenScene = Scene<GardenNodeData, GardenLayer, GardenPose>;
export type GardenAddNodeSpec = AddNodeSpec<GardenNodeData, GardenLayer, GardenPose>;
export type GardenSerializedScene = SerializedScene<GardenNodeData, GardenLayer, GardenPose>;

/**
 * Eric's scenes save version 1 with poses already parent-local (eric composed them
 * itself), but weasel reads every version 1 save as world and would localize the
 * nested ones a second time. So eric upgrades its own version 1 saves to version 3
 * before loading: every node a mark, and the clip the kit used to give a top-level
 * container by default made explicit. `'eric:none'` was eric's no-clip key.
 */
export function upgradeGardenSave(
  saved: SavedScene<GardenNodeData, GardenLayer, GardenPose>,
): GardenSerializedScene {
  if (saved.version !== 1) return saved as GardenSerializedScene;
  const nodes = saved.nodes.map(({ kind, clipFromPoseKey, ...rest }) => {
    const node: GardenSerializedScene['nodes'][number] = { ...rest, kind: 'mark' };
    if (clipFromPoseKey !== undefined && clipFromPoseKey !== 'eric:none')
      node.clipFromPoseKey = clipFromPoseKey;
    if (kind === 'container' && rest.parent === undefined && clipFromPoseKey === undefined)
      node.clip = 'outline';
    return node;
  });
  return { ...saved, version: 3, nodes };
}

/** Which garden nodes take children by drop or insert: every zone, and a
 *  structure that is a container or already holds something (a patio with pots). */
export function gardenCanDropInto(scene: GardenScene): CanDropIntoDep {
  return (parentId) => {
    const node = scene.get(asNodeId(parentId));
    if (!node) return false;
    if (node.data.kind === 'zone') return true;
    if (node.data.kind !== 'structure') return false;
    return node.data.container || scene.childrenOf(node.id).length > 0;
  };
}

/** Child poses are parent-relative by translation only; a rotated container does
 *  not turn its children (weasel's default composition would). */
export const GARDEN_POSE_COMPOSITION = RECT_POSE_COMPOSITION as PoseComposition<GardenPose>;

/** The non-spatial remainder of a Garden — everything the Scene does NOT own.
 *  `nursery` is excluded: it is backed by its own NurseryScene (see
 *  src/scene/nurseryScene.ts), composed into `garden.nursery` separately. */
export type GardenBase = Omit<Garden, 'structures' | 'zones' | 'plantings' | 'nursery'>;

export function createGardenScene(initial: readonly GardenAddNodeSpec[]): GardenScene {
  return createScene<GardenNodeData, GardenLayer, GardenPose>({
    systemLayers: GARDEN_LAYERS.map((id) => ({ id })),
    initial,
    historyLimit: GARDEN_HISTORY_LIMIT,
    composition: GARDEN_POSE_COMPOSITION,
  });
}
