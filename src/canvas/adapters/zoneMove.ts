import { useGardenStore } from '../../store/gardenStore';
import type { Zone } from '../../model/types';
import type { MoveAdapter } from '@orochi235/weasel';

export interface ZonePose { x: number; y: number; widthFt: number; lengthFt: number }

export type ZoneMoveAdapter = MoveAdapter<Zone, ZonePose> & {
  insertObject(z: Zone): void;
  removeObject(id: string): void;
};

export function createZoneMoveAdapter(): ZoneMoveAdapter {
  function getZone(id: string): Zone | undefined {
    return useGardenStore.getState().garden.zones.find((z) => z.id === id);
  }
  const adapter: ZoneMoveAdapter = {
    getObject(id) {
      return getZone(id);
    },
    getObjects() {
      return useGardenStore.getState().garden.zones;
    },
    getPose(id) {
      const z = getZone(id);
      if (!z) throw new Error(`zone not found: ${id}`);
      return { x: z.x, y: z.y, widthFt: z.width, lengthFt: z.length };
    },
    getParent: () => null,
    setPose(id, pose) {
      useGardenStore.getState().updateZone(id, { x: pose.x, y: pose.y });
    },
    setParent: () => {},
    insertObject(z) {
      useGardenStore.setState((s) => ({ garden: { ...s.garden, zones: [...s.garden.zones, z] } }));
    },
    removeObject(id) {
      useGardenStore.setState((s) => ({ garden: { ...s.garden, zones: s.garden.zones.filter((z) => z.id !== id) } }));
    },
    applyBatch(ops, label) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply(adapter);
      void label;
    },
  };
  return adapter;
}
