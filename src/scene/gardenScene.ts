import type { AddNodeSpec, Scene } from '@orochi235/weasel';
import { createScene } from '@orochi235/weasel';
import type { Layout } from '../model/layout';
import type { FillType, Garden, LayerId, StructureShape } from '../model/types';

export type GardenLayer = LayerId;

/** Render order, low→high. Matches the old structures-under-zones-under-plantings stacking. */
export const GARDEN_LAYERS: readonly GardenLayer[] = [
  'ground',
  'blueprint',
  'structures',
  'zones',
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

/** The non-spatial remainder of a Garden — everything the Scene does NOT own. */
export type GardenBase = Omit<Garden, 'structures' | 'zones' | 'plantings'>;

export function createGardenScene(initial: readonly GardenAddNodeSpec[]): GardenScene {
  return createScene<GardenNodeData, GardenLayer, GardenPose>({
    systemLayers: GARDEN_LAYERS.map((id) => ({ id })),
    initial,
    historyLimit: GARDEN_HISTORY_LIMIT,
  });
}
