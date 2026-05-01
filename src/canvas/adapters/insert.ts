import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { createStructure, createZone } from '../../model/types';
import type { Structure, Zone } from '../../model/types';
import type { InsertAdapter, Op } from '@/canvas-kit';

type GardenObj = (Structure | Zone) & { id: string };

export interface GardenInsertAdapter extends InsertAdapter<GardenObj> {
  insertObject(obj: GardenObj): void;
  removeObject(id: string): void;
}

export function createInsertAdapter(): GardenInsertAdapter {
  const adapter: GardenInsertAdapter = {
    commitInsert(b) {
      const tool = useUiStore.getState().plottingTool;
      if (!tool) return null;
      if (tool.category === 'structures') {
        return createStructure({
          type: tool.type,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
        }) as GardenObj;
      }
      if (tool.category === 'zones') {
        return createZone({
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          color: tool.color,
          pattern: tool.pattern ?? null,
        }) as GardenObj;
      }
      return null;
    },
    insertObject(obj) {
      if ('type' in obj) {
        useGardenStore.setState((s) => ({
          garden: { ...s.garden, structures: [...s.garden.structures, obj as Structure] },
        }));
      } else {
        useGardenStore.setState((s) => ({
          garden: { ...s.garden, zones: [...s.garden.zones, obj as Zone] },
        }));
      }
    },
    removeObject(id) {
      useGardenStore.setState((s) => ({
        garden: {
          ...s.garden,
          structures: s.garden.structures.filter((s) => s.id !== id),
          zones: s.garden.zones.filter((z) => z.id !== id),
        },
      }));
    },
    commitPaste(_clipboard, _offset) {
      return [];
    },
    snapshotSelection(_ids) {
      return { items: [] };
    },
    setSelection(ids) {
      useUiStore.getState().setSelection(ids);
    },
    applyBatch(ops: Op[], _label: string) {
      useGardenStore.getState().checkpoint();
      for (const op of ops) op.apply(adapter);
    },
  };
  return adapter;
}
