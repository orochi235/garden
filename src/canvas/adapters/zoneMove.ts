import { useGardenStore } from '../../store/gardenStore';
import type { Zone } from '../../model/types';
import type { MoveAdapter } from '@orochi235/weasel';

export interface ZonePose { x: number; y: number; widthFt: number; lengthFt: number }

export type ZoneMoveAdapter = MoveAdapter<Zone, ZonePose> & {
  insertNode(z: Zone): void;
  removeNode(id: string): void;
};

export function createZoneMoveAdapter(): ZoneMoveAdapter {
  function getZone(id: string): Zone | undefined {
    return useGardenStore.getState().garden.zones.find((z) => z.id === id);
  }
  const adapter: ZoneMoveAdapter = {
    getNode(id) {
      return getZone(id);
    },
    getNodes() {
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
    insertNode(z) {
      useGardenStore.setState((s) => ({ garden: { ...s.garden, zones: [...s.garden.zones, z] } }));
    },
    removeNode(id) {
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
