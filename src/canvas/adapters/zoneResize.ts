import { useGardenStore } from '../../store/gardenStore';
import type { Zone } from '../../model/types';
import type { ResizeAdapter } from '@orochi235/weasel';

export interface ZoneResizePose { x: number; y: number; width: number; height: number }

export function createZoneResizeAdapter(): ResizeAdapter<Zone, ZoneResizePose> {
  function getZone(id: string): Zone | undefined {
    return useGardenStore.getState().garden.zones.find((z) => z.id === id);
  }
  const adapter: ResizeAdapter<Zone, ZoneResizePose> = {
    getObject(id) {
      return getZone(id);
    },
    getPose(id) {
      const z = getZone(id);
      if (!z) throw new Error(`zone not found: ${id}`);
      return { x: z.x, y: z.y, width: z.width, height: z.height };
    },
    setPose(id, pose) {
      useGardenStore.getState().updateZone(id, {
        x: pose.x,
        y: pose.y,
        width: pose.width,
        height: pose.height,
      });
    },
    applyBatch(ops, _label) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply(adapter);
    },
  };
  return adapter;
}
