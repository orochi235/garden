import type { AddNodeSpec, Scene, SerializedScene } from '@orochi235/weasel';
import { createScene } from '@orochi235/weasel';
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
 * node's structural kind ('leaf' | 'container'). */
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
 * `clipFromPose` that disables the kit's container clip. Used for NESTED
 * containers (e.g. pots on a patio): their scene pose is parent-LOCAL, but
 * eric's scene-slot painter renders in world space, so the kit's default
 * local-pose silhouette clip would clip the world-space body out entirely.
 * Registered under `CLIP_NONE_KEY` so it round-trips through `loadState`
 * (functions can't serialize — the key resolves back to this fn via the
 * scene registry). Must be a STABLE reference for the registry reverse-lookup.
 */
export const CLIP_NONE_KEY = 'eric:none';
export const clipNone = (): null => null;

/** The non-spatial remainder of a Garden — everything the Scene does NOT own. */
export type GardenBase = Omit<Garden, 'structures' | 'zones' | 'plantings'>;

export function createGardenScene(initial: readonly GardenAddNodeSpec[]): GardenScene {
  return createScene<GardenNodeData, GardenLayer, GardenPose>({
    systemLayers: GARDEN_LAYERS.map((id) => ({ id })),
    initial,
    historyLimit: GARDEN_HISTORY_LIMIT,
    // Resolves `clipFromPoseKey` back to `clipNone` after loadState/sceneFromJSON
    // (see CLIP_NONE_KEY) so nested-container clip-disabling survives a scene
    // serialize → restore round-trip.
    registry: { clipFromPose: { [CLIP_NONE_KEY]: clipNone } },
  });
}
