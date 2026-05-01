import { useGardenStore } from '../../store/gardenStore';
import type { Zone } from '../../model/types';
import type { MoveAdapter, Op } from '@/canvas-kit';

export interface ZonePose { x: number; y: number; widthFt: number; heightFt: number }

export function createZoneMoveAdapter(): MoveAdapter<Zone, ZonePose> {
  function getZone(id: string): Zone | undefined {
    return useGardenStore.getState().garden.zones.find((z) => z.id === id);
  }
  return {
    getPose(id) {
      const z = getZone(id);
      if (!z) throw new Error(`zone not found: ${id}`);
      return { x: z.x, y: z.y, widthFt: z.width, heightFt: z.height };
    },
    getParent: () => null,
    setPose(id, pose) {
      useGardenStore.getState().updateZone(id, { x: pose.x, y: pose.y });
    },
    setParent: () => {},
    applyBatch(ops: Op[], label: string) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply({
        setPose: (id: string, pose: ZonePose) => {
          useGardenStore.getState().updateZone(id, { x: pose.x, y: pose.y });
        },
        setParent: () => {},
        insertObject: (z: Zone) => {
          useGardenStore.setState((s) => ({ garden: { ...s.garden, zones: [...s.garden.zones, z] } }));
        },
        removeObject: (id: string) => {
          useGardenStore.setState((s) => ({ garden: { ...s.garden, zones: s.garden.zones.filter((z) => z.id !== id) } }));
        },
      });
      void label;
    },
  };
}
